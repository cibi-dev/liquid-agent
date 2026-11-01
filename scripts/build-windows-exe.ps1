# build-windows-exe.ps1
# Compiles Liquid Agent as a standalone native Windows binary using Tauri 2.0 and Rust

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  Liquid Agent - Native Windows Binary Build     " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# 1. Ensure Cargo is in PATH
$cargoPath = "$env:USERPROFILE\.cargo\bin"
if (Test-Path "$cargoPath\cargo.exe") {
    if ($env:PATH -notlike "*$cargoPath*") {
        $env:PATH = "$cargoPath;$env:PATH"
    }
} else {
    Write-Error "Cargo was not found in $cargoPath. Please ensure Rust is installed."
}

Write-Host "`n[1/3] Building Web Frontend (Vite)..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Frontend build failed with exit code $LASTEXITCODE"
}

Write-Host "`n[2/3] Compiling Native Tauri Binary (Rust MSVC)..." -ForegroundColor Yellow
$env:CARGO_BUILD_JOBS = "4"
npx tauri build --no-bundle
if ($LASTEXITCODE -ne 0) {
    Write-Error "Tauri build failed with exit code $LASTEXITCODE"
}

$candidates = @(
    (Join-Path $projectRoot "src-tauri\target\release\liquid-agent.exe"),
    (Join-Path $projectRoot "src-tauri\target\release\Liquid Agent.exe"),
    (Join-Path $projectRoot "src-tauri\target\release\app.exe")
)

$found = $null
foreach ($c in $candidates) {
    if (Test-Path $c) {
        $found = $c
        break
    }
}

if ($found) {
    $distDir = Join-Path $projectRoot "dist-native"
    if (-not (Test-Path $distDir)) {
        New-Item -ItemType Directory -Path $distDir | Out-Null
    }
    $finalExe = Join-Path $distDir "Liquid Agent.exe"
    Copy-Item -Path $found -Destination $finalExe -Force

    $dllSource = Join-Path $projectRoot "src-tauri\target\release\WebView2Loader.dll"
    if (Test-Path $dllSource) {
        Copy-Item -Path $dllSource -Destination (Join-Path $distDir "WebView2Loader.dll") -Force
    }

    $sizeMB = [math]::Round(((Get-Item $finalExe).Length / 1MB), 2)
    Write-Host "`n[3/3] Build Successful!" -ForegroundColor Green
    Write-Host "Binary: $finalExe" -ForegroundColor Cyan
    Write-Host "Size:   $sizeMB MB" -ForegroundColor Cyan
} else {
    Write-Error "Expected binary not found in target\release"
}
