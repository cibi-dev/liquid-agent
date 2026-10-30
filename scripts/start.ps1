# PowerShell startup script for Liquid Agent on Windows 11
# Starts Liquid Agent and opens it in your web browser.
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")
Set-Location $ProjectRoot

# Set UTF-8 encoding for console
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "→ Starting Liquid Agent on Windows..." -ForegroundColor Cyan

# Check Node.js version
$nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Error "Node.js is not found in PATH. Please install Node.js 20+ from https://nodejs.org/"
    exit 1
}

$nodeVersion = node -p "process.versions.node"
$majorVersion = [int]($nodeVersion.Split('.')[0])
if ($majorVersion -lt 20) {
    Write-Error "Node.js version is $nodeVersion. Liquid Agent requires Node.js 20 or newer."
    exit 1
}

Write-Host "  Using Node.js v$nodeVersion" -ForegroundColor Gray

# Install dependencies if node_modules is missing or package.json is newer
$needInstall = $false
if (-not (Test-Path "node_modules")) {
    $needInstall = $true
} elseif ((Get-Item "package.json").LastWriteTime -gt (Get-Item "node_modules").LastWriteTime) {
    $needInstall = $true
}

if ($needInstall) {
    Write-Host "→ Installing dependencies (one time only)..." -ForegroundColor Cyan
    npm ci --no-audit --no-fund --loglevel=error
    if ($LASTEXITCODE -ne 0) {
        Write-Error "npm ci failed."
        exit $LASTEXITCODE
    }
}

# Build frontend if dist is missing
if (-not (Test-Path "web/dist/index.html")) {
    Write-Host "→ Building web frontend (one time only)..." -ForegroundColor Cyan
    npm run build --silent
    if ($LASTEXITCODE -ne 0) {
        Write-Error "npm run build failed."
        exit $LASTEXITCODE
    }
}

Write-Host "→ Launching Liquid Agent server..." -ForegroundColor Green
node server/index.js --open
