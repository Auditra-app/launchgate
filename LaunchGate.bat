@echo off
setlocal enabledelayedexpansion
title LaunchGate Command Center Launcher
cd /d "%~dp0"

echo =======================================================================
echo   LaunchGate: Enterprise Production Readiness Command Center
echo =======================================================================

:: Check if port 4545 is active using silent TCP test
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $client = New-Object System.Net.Sockets.TcpClient('127.0.0.1', 4545); $client.Close(); exit 0 } catch { exit 1 }"

if %ERRORLEVEL% equ 0 (
    echo [OK] LaunchGate server is ALREADY ACTIVE on port 4545.
    echo [*] Opening http://localhost:4545 in your default browser...
    start http://localhost:4545
    exit /b 0
)

echo [*] LaunchGate server is not currently running.
echo [*] Starting LaunchGate server silently in background...

:: Launch hidden via VBScript wrapper
wscript //nologo "%~dp0LaunchGate-Launcher.vbs"

echo [OK] LaunchGate Command Center launched!
exit /b 0
