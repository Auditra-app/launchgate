# ==============================================================================
# LaunchGate Desktop Shortcut Installer
# Creates "LaunchGate Command Center.lnk" on the user's Windows Desktop
# ==============================================================================

$ErrorActionPreference = "Stop"

$desktopPath = [Environment]::GetFolderPath("Desktop")
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not (Test-Path (Join-Path $projectRoot "LaunchGate-Launcher.vbs"))) {
    $projectRoot = (Get-Location).Path
}

$vbsLauncher = Join-Path $projectRoot "LaunchGate-Launcher.vbs"
$iconPath = Join-Path $projectRoot "assets\launchgate.ico"
$shortcutPath = Join-Path $desktopPath "LaunchGate Command Center.lnk"

Write-Host "Creating LaunchGate Desktop Shortcut..." -ForegroundColor Cyan
Write-Host "  Desktop:        $desktopPath"
Write-Host "  Project Root:   $projectRoot"
Write-Host "  Launcher VBS:   $vbsLauncher"
Write-Host "  App Icon:       $iconPath"
Write-Host "  Target Shortcut:$shortcutPath"

# Validate that target files exist
if (-not (Test-Path $vbsLauncher)) {
    throw "Error: LaunchGate-Launcher.vbs not found at $vbsLauncher"
}
if (-not (Test-Path $iconPath)) {
    throw "Error: launchgate.ico not found at $iconPath"
}

$wshShell = New-Object -ComObject WScript.Shell
$shortcut = $wshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = "`"$vbsLauncher`""
$shortcut.WorkingDirectory = $projectRoot
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Description = "LaunchGate Production Readiness Command Center"
$shortcut.Save()

[System.Runtime.InteropServices.Marshal]::ReleaseComObject($wshShell) | Out-Null

if (Test-Path $shortcutPath) {
    Write-Host "`n[SUCCESS] Desktop shortcut created successfully!" -ForegroundColor Green
    Write-Host "Path: $shortcutPath"
} else {
    throw "Error: Failed to create shortcut at $shortcutPath"
}
