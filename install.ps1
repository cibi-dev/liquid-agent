# install.ps1
# Installs or launches Liquid Agent on Windows 10 / Windows 11
# Usage:
#   irm https://raw.githubusercontent.com/cibi-dev/liquid-agent/main/install.ps1 | iex
# or locally:
#   powershell -ExecutionPolicy Bypass -File install.ps1

[CmdletBinding()]
param(
    [string]$Repo = "cibi-dev/liquid-agent",
    [string]$Branch = "main",
    [string]$TargetDir = "$env:USERPROFILE\.liquid-agent"
)

$ErrorActionPreference = "Stop"

# UTF-8 terminal encoding
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Write-Step([string]$msg) {
    Write-Host "→ $msg" -ForegroundColor Cyan
}

function Write-Success([string]$msg) {
    Write-Host "✓ $msg" -ForegroundColor Green
}

function Write-Warn([string]$msg) {
    Write-Host "⚠ $msg" -ForegroundColor Yellow
}

Clear-Host
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "       Liquid Agent - Windows 11 Installation             " -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Determine if running inside cloned repo or fresh one-liner
$currentDir = Get-Location
$isClonedRepo = (Test-Path (Join-Path $currentDir "server\index.js")) -and (Test-Path (Join-Path $currentDir "package.json"))

$appDir = ""
if ($isClonedRepo) {
    $appDir = $currentDir.Path
    Write-Step "Detected cloned repository at: $appDir"
} else {
    $appDir = Join-Path $TargetDir "app"
    Write-Step "Installing into: $appDir"
    if (-not (Test-Path $TargetDir)) {
        New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
    }
}

# 2. Check Node.js
Write-Step "Checking Node.js runtime..."
$nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Warn "Node.js 20+ was not found in PATH."
    Write-Host "Please download and install Node.js 22 LTS from: https://nodejs.org/" -ForegroundColor Yellow
    Write-Host "After installation, re-run this script." -ForegroundColor Yellow
    exit 1
}

$nodeVer = node -p "process.versions.node"
$major = [int]($nodeVer.Split('.')[0])
if ($major -lt 20) {
    Write-Warn "Node.js v$nodeVer detected. Liquid Agent requires Node.js 20 or newer."
    Write-Host "Please update Node.js at https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}
Write-Success "Using Node.js v$nodeVer"

# 3. If fresh install, download repository archive
if (-not $isClonedRepo) {
    if (-not (Test-Path $appDir)) {
        Write-Step "Downloading Liquid Agent repository archive ($Branch)..."
        $zipUrl = "https://github.com/$Repo/archive/refs/heads/$Branch.zip"
        $zipPath = Join-Path $TargetDir "repo.zip"
        $tmpExtract = Join-Path $TargetDir "tmp_extract"
        
        Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath
        Expand-Archive -Path $zipPath -DestinationPath $tmpExtract -Force
        
        $innerDir = (Get-ChildItem -Path $tmpExtract -Directory | Select-Object -First 1).FullName
        Move-Item -Path $innerDir -Destination $appDir -Force
        Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
        Remove-Item -Path $tmpExtract -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Set-Location $appDir

# 4. Install npm dependencies
Write-Step "Installing npm dependencies (one time only)..."
npm ci --no-audit --no-fund --loglevel=error
if ($LASTEXITCODE -ne 0) {
    Write-Warn "npm ci returned exit code $LASTEXITCODE; trying npm install..."
    npm install --no-audit --no-fund
}
Write-Success "Dependencies installed."

# 5. Build frontend
if (-not (Test-Path "web\dist\index.html")) {
    Write-Step "Building web frontend with Vite..."
    npm run build --silent
    Write-Success "Web frontend built."
}

# 6. Create Desktop and Start Menu Shortcuts
try {
    $wsh = New-Object -ComObject WScript.Shell
    $batPath = Join-Path $appDir "Liquid Agent.bat"
    $iconPath = Join-Path $appDir "src-tauri\icons\icon.ico"
    
    $desktopPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
    $shortcut = $wsh.CreateShortcut((Join-Path $desktopPath "Liquid Agent.lnk"))
    $shortcut.TargetPath = $batPath
    $shortcut.WorkingDirectory = $appDir
    if (Test-Path $iconPath) { $shortcut.IconLocation = $iconPath }
    $shortcut.Description = "Liquid Agent - Private AI Agent for Windows 11"
    $shortcut.Save()

    $startMenu = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Programs)
    $shortcutStart = $wsh.CreateShortcut((Join-Path $startMenu "Liquid Agent.lnk"))
    $shortcutStart.TargetPath = $batPath
    $shortcutStart.WorkingDirectory = $appDir
    if (Test-Path $iconPath) { $shortcutStart.IconLocation = $iconPath }
    $shortcutStart.Description = "Liquid Agent - Private AI Agent for Windows 11"
    $shortcutStart.Save()
    Write-Success "Desktop and Start Menu shortcuts created."
} catch {
    Write-Warn "Could not create Windows shortcuts automatically: $($_.Exception.Message)"
}

Write-Host ""
Write-Success "Liquid Agent is ready!"
Write-Host "Starting server and launching web interface..." -ForegroundColor Green
Write-Host ""

Start-Process -FilePath (Join-Path $appDir "Liquid Agent.bat")
