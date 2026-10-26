@echo off
setlocal enabledelayedexpansion
title LaunchGate Command Center
cd /d "%~dp0"

echo =======================================================================
echo   🚀 LaunchGate: Enterprise Production Readiness Command Center
echo =======================================================================

:: 1. Verify Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in your PATH.
    echo Please install Node.js 18+ from https://nodejs.org/ and try again.
    echo.
    pause
    exit /b 1
)

:: 2. Check if dependencies are installed
if not exist "node_modules\" (
    echo [*] First-time setup: Installing required dependencies...
    call npm install --no-audit --no-fund
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed successfully!
)

:: 3. Check if server is already running on port 4545
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $client = New-Object System.Net.Sockets.TcpClient('127.0.0.1', 4545); $client.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [OK] LaunchGate is ALREADY RUNNING on port 4545.
    echo [*] Opening http://localhost:4545 in your default browser...
    start http://localhost:4545
    exit /b 0
)

:: 4. Launch browser in parallel
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:4545"

:: 5. Start LaunchGate Server
echo [*] Starting LaunchGate server at http://localhost:4545 ...
node server.js
if %ERRORLEVEL% neq 0 (
    pause
)
