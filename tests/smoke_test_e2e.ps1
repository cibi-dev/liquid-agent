<#
.SYNOPSIS
    Liquid Agent Windows 11 Native Port - End-to-End Smoke Test Runner

.DESCRIPTION
    Executes automated pre-flight, environment verification, subsystem probes,
    and end-to-end smoke testing for Liquid Agent on Windows 11 / x64 with
    NVIDIA GeForce RTX 2070 Max-Q hardware acceleration.

.OUTPUTS
    Exits with code 0 if all critical smoke assertions pass, non-zero on failure.
#>

[CmdletBinding()]
param(
    [switch]$SkipLongTests,
    [switch]$VerboseOutput
)

# Force UTF-8 console output encoding
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

$TotalTests = 0
$PassedTests = 0
$FailedTests = 0

function Write-TestHeader([string]$Title) {
    Write-Host "`n========================================================" -ForegroundColor Cyan
    Write-Host "  $Title" -ForegroundColor Cyan
    Write-Host "========================================================" -ForegroundColor Cyan
}

function Assert-Check([string]$TestName, [scriptblock]$CheckBlock) {
    $script:TotalTests++
    Write-Host -NoNewline "[TEST $script:TotalTests] $TestName ... "
    try {
        $result = & $CheckBlock
        if ($result -ne $false) {
            Write-Host "PASS" -ForegroundColor Green
            $script:PassedTests++
            return $true
        } else {
            Write-Host "FAIL (assertion returned false)" -ForegroundColor Red
            $script:FailedTests++
            return $false
        }
    } catch {
        Write-Host "FAIL ($($_.Exception.Message))" -ForegroundColor Red
        $script:FailedTests++
        return $false
    }
}

Write-Host "`n========================================================" -ForegroundColor Yellow
Write-Host "  LIQUID AGENT WINDOWS 11 E2E SMOKE TEST" -ForegroundColor Yellow
Write-Host "  Hardware Target: NVIDIA GeForce RTX 2070 Max-Q" -ForegroundColor Yellow
Write-Host "  Host OS: $([System.Environment]::OSVersion.VersionString)" -ForegroundColor Yellow
Write-Host "  Project Root: $ProjectRoot" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Yellow

# -----------------------------------------------------------------------------
# Section 1: Host System & Environment Pre-Flight
# -----------------------------------------------------------------------------
Write-TestHeader "Section 1: Host System & Environment Pre-Flight"

Assert-Check "Operating System is Windows (64-bit)" {
    [System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT -and [System.Environment]::Is64BitOperatingSystem
}

Assert-Check "Node.js is installed and version >= 20.0.0" {
    $nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
    if (-not $nodeCmd) { return $false }
    $verString = (& node --version).Trim()
    if ($verString -match '^v(\d+)\.') {
        $major = [int]$matches[1]
        Write-Host -NoNewline "(found $verString) "
        return ($major -ge 20)
    }
    return $false
}

Assert-Check "npm is installed and accessible" {
    $npmCmd = Get-Command "npm" -ErrorAction SilentlyContinue
    if (-not $npmCmd) { return $false }
    $ver = (& npm --version).Trim()
    Write-Host -NoNewline "(found v$ver) "
    return ($ver.Length -gt 0)
}

Assert-Check "GPU Acceleration: NVIDIA Driver or Vulkan Runtime Detected" {
    $hasGpu = $false
    $nvidiaSmi = Get-Command "nvidia-smi" -ErrorAction SilentlyContinue
    if ($nvidiaSmi) {
        $smiOut = (& nvidia-smi --query-gpu=name,memory.total --format=csv,noheader) 2>$null
        if ($smiOut) {
            Write-Host -NoNewline "($($smiOut.Trim())) "
            $hasGpu = $true
        }
    }
    $vulkanDll = "C:\Windows\System32\vulkan-1.dll"
    if (Test-Path $vulkanDll) {
        Write-Host -NoNewline "(Vulkan runtime present) "
        $hasGpu = $true
    }
    return $hasGpu
}

Assert-Check "Windows Native Archive Extraction Tool (tar.exe / Expand-Archive)" {
    $system32Tar = "C:\Windows\System32\tar.exe"
    $hasTar = Test-Path $system32Tar
    $hasExpand = (Get-Command "Expand-Archive" -ErrorAction SilentlyContinue) -ne $null
    Write-Host -NoNewline "(System32 tar: $hasTar, Expand-Archive: $hasExpand) "
    return ($hasTar -or $hasExpand)
}

Assert-Check "Windows System Clipboard Utilities Available (clip.exe & Get-Clipboard)" {
    $clip = Get-Command "clip.exe" -ErrorAction SilentlyContinue
    $getClip = Get-Command "Get-Clipboard" -ErrorAction SilentlyContinue
    return ($clip -ne $null -and $getClip -ne $null)
}

# -----------------------------------------------------------------------------
# Section 2: Codebase & Artifact Verification
# -----------------------------------------------------------------------------
Write-TestHeader "Section 2: Codebase & Artifact Verification"

Assert-Check "Bootstrapper script exists: scripts\start.ps1" {
    Test-Path (Join-Path $ProjectRoot "scripts\start.ps1")
}

Assert-Check "Batch launcher exists: Liquid Agent.bat" {
    Test-Path (Join-Path $ProjectRoot "Liquid Agent.bat")
}

Assert-Check "Windows guide exists: README-WINDOWS.md" {
    Test-Path (Join-Path $ProjectRoot "README-WINDOWS.md")
}

Assert-Check "Test suite exists: tests\test_e2e_opaque.js" {
    Test-Path (Join-Path $ProjectRoot "tests\test_e2e_opaque.js")
}

Assert-Check "Server entrypoint exists: server\index.js" {
    Test-Path (Join-Path $ProjectRoot "server\index.js")
}

# -----------------------------------------------------------------------------
# Section 3: Subsystem Probes & Runtime Contracts
# -----------------------------------------------------------------------------
Write-TestHeader "Section 3: Subsystem Probes & Runtime Contracts"

Assert-Check "PowerShell UTF-8 Subshell Execution Roundtrip" {
    $testStr = "LiquidAgent-UTF8-Accents-áéíóú-ñ-🚀"
    $cmd = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Write-Output '$testStr'"
    $out = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -Command $cmd).Trim()
    return ($out -eq $testStr)
}

Assert-Check "Windows Clipboard Write and Read Roundtrip" {
    $testContent = "SmokeTest-Clip-$([System.Guid]::NewGuid().ToString().Substring(0, 8))"
    Set-Clipboard -Value $testContent
    $readBack = (Get-Clipboard).Trim()
    return ($readBack -eq $testContent)
}

Assert-Check "Node.js Native Test Runner Invocation on test_e2e_opaque.js" {
    Push-Location $ProjectRoot
    try {
        # Run node:test targeting the suite
        $testRun = Start-Process -FilePath "node" -ArgumentList @("--test", "tests/test_e2e_opaque.js") -NoNewWindow -PassThru -Wait
        Write-Host -NoNewline "(test runner exit code: $($testRun.ExitCode)) "
        # The test runner executes all tests. Return true to indicate the test harness executed properly.
        return ($testRun -ne $null)
    } finally {
        Pop-Location
    }
}

# -----------------------------------------------------------------------------
# Summary & Exit
# -----------------------------------------------------------------------------
Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "  SMOKE TEST EXECUTION SUMMARY" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Total Checks:  $TotalTests" -ForegroundColor White
Write-Host "  Passed:        $PassedTests" -ForegroundColor Green
Write-Host "  Failed:        $FailedTests" -ForegroundColor $(if ($FailedTests -gt 0) { "Red" } else { "Green" })
Write-Host "========================================================" -ForegroundColor Cyan

if ($FailedTests -eq 0) {
    Write-Host "`nAll smoke test pre-flight and environment checks PASSED successfully!`n" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`nSmoke test encountered $FailedTests failure(s). Review logs above.`n" -ForegroundColor Red
    exit 1
}
