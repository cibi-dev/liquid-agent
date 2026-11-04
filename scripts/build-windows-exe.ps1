# build-windows-exe.ps1
# Compiles and packages Liquid Agent as a standalone native Windows portable bundle (Tauri 2.0 / Rust / Node.js)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  Liquid Agent - Native Windows Binary Build     " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# 0. Check Windows Folder Integrity Level
try {
    $integrity = icacls $projectRoot | Select-String "Mandatory"
    if ($integrity -match "Low Mandatory Level") {
        Write-Warning "Project folder has Low integrity label. Fixing to Medium..."
        icacls $projectRoot /setintegritylevel (OI)(CI)M /T /C | Out-Null
    }
} catch {
    Write-Warning "Could not verify folder integrity level: $($_.Exception.Message)"
}

# 1. Clean PATH and ensure Rust MSVC
Remove-Item Env:MSYSTEM -ErrorAction SilentlyContinue
$cleanPathParts = ($env:PATH -split ';') | Where-Object {
    $_ -notmatch 'Strawberry|MinGW|msys64|Git\\usr\\bin'
}
$cargoPath = "$env:USERPROFILE\.cargo\bin"
if (Test-Path "$cargoPath\cargo.exe") {
    if ($cleanPathParts -notcontains $cargoPath) {
        $cleanPathParts = @($cargoPath) + $cleanPathParts
    }
} else {
    Write-Error "Cargo was not found in $cargoPath. Please ensure Rust is installed."
}
$env:PATH = ($cleanPathParts -join ';')

try {
    rustup default stable-x86_64-pc-windows-msvc | Out-Null
} catch {
    Write-Warning "Could not set default rust toolchain to MSVC: $($_.Exception.Message)"
}

# 2. Build Web Frontend (Vite)
Write-Host "`n[1/4] Building Web Frontend (Vite)..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Frontend build failed with exit code $LASTEXITCODE"
}

# 3. Compile Native Tauri Binary (Rust MSVC)
Write-Host "`n[2/4] Compiling Native Tauri Binary (Rust MSVC)..." -ForegroundColor Yellow
$env:CARGO_BUILD_JOBS = "4"
npx tauri build --no-bundle
if ($LASTEXITCODE -ne 0) {
    Write-Error "Tauri build failed with exit code $LASTEXITCODE"
}

$candidates = @(
    (Join-Path $projectRoot "src-tauri\target\release\Liquid Agent.exe"),
    (Join-Path $projectRoot "src-tauri\target\release\liquid-agent.exe"),
    (Join-Path $projectRoot "src-tauri\target\release\app.exe")
)

$found = $null
foreach ($c in $candidates) {
    if (Test-Path $c) {
        $found = $c
        break
    }
}

if (-not $found) {
    Write-Error "Expected binary not found in src-tauri\target\release"
}

# 4. Package Distributable Bundle
Write-Host "`n[3/4] Packaging Standalone Distributable Bundle..." -ForegroundColor Yellow
$distDir = Join-Path $projectRoot "dist-native"
$packageDir = Join-Path $distDir "Liquid-Agent"

if (-not (Test-Path $distDir)) {
    New-Item -ItemType Directory -Path $distDir -Force | Out-Null
}
if (-not (Test-Path $packageDir)) {
    New-Item -ItemType Directory -Path $packageDir -Force | Out-Null
}

# Copy binary to both package dir and root distDir
$finalExe = Join-Path $packageDir "Liquid Agent.exe"
Copy-Item -Path $found -Destination $finalExe -Force
Copy-Item -Path $found -Destination (Join-Path $distDir "Liquid Agent.exe") -Force

# Copy server, web/dist, package.json, and ws dependency
Copy-Item -Recurse -Force (Join-Path $projectRoot "server") (Join-Path $packageDir "server")
$webDistTarget = Join-Path $packageDir "web\dist"
if (-not (Test-Path (Join-Path $packageDir "web"))) {
    New-Item -ItemType Directory -Path (Join-Path $packageDir "web") -Force | Out-Null
}
Copy-Item -Recurse -Force (Join-Path $projectRoot "web\dist") $webDistTarget
Copy-Item -Force (Join-Path $projectRoot "package.json") (Join-Path $packageDir "package.json")

$wsSource = Join-Path $projectRoot "node_modules\ws"
$nodeModulesTarget = Join-Path $packageDir "node_modules"
if (Test-Path $wsSource) {
    if (-not (Test-Path $nodeModulesTarget)) {
        New-Item -ItemType Directory -Path $nodeModulesTarget -Force | Out-Null
    }
    Copy-Item -Recurse -Force $wsSource (Join-Path $nodeModulesTarget "ws")
}

# 5. Portable Node.js Runtime
$binDir = Join-Path $packageDir "bin"
if (-not (Test-Path $binDir)) {
    New-Item -ItemType Directory -Path $binDir -Force | Out-Null
}
$nodeExeTarget = Join-Path $binDir "node.exe"
if (-not (Test-Path $nodeExeTarget)) {
    $localNode = (Get-Command "node" -ErrorAction SilentlyContinue).Source
    if ($localNode -and (Test-Path $localNode)) {
        Write-Host "Copying local Node.js binary ($localNode) to package bin/..." -ForegroundColor Gray
        Copy-Item -Path $localNode -Destination $nodeExeTarget -Force
    } else {
        Write-Host "Downloading portable Node.js runtime (v22.14.0 LTS x64)..." -ForegroundColor Yellow
        Invoke-WebRequest -Uri "https://nodejs.org/dist/v22.14.0/win-x64/node.exe" -OutFile $nodeExeTarget
    }
}

# Clean legacy backup files if present
Remove-Item (Join-Path $distDir "Liquid Agent.exe.gnu.bak") -Force -ErrorAction SilentlyContinue

# Compress portable zip
Write-Host "`n[4/4] Compressing Release Archive..." -ForegroundColor Yellow
$zipPath = Join-Path $distDir "Liquid-Agent-Windows-x64.zip"
Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
Compress-Archive -Path $packageDir -DestinationPath $zipPath -Force

$zipSizeMB = [math]::Round(((Get-Item $zipPath).Length / 1MB), 2)
Write-Host "`n=================================================" -ForegroundColor Green
Write-Host "  Build & Packaging Successful!                  " -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green
Write-Host "Package Folder:  $packageDir" -ForegroundColor Cyan
Write-Host "Release Archive: $zipPath ($zipSizeMB MB)" -ForegroundColor Cyan
