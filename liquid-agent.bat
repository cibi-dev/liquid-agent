@echo off
title Liquid Agent
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "scripts\start.ps1" %*
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Liquid Agent encountered an error. Press any key to exit.
    pause >nul
)
