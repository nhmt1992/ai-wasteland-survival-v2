@echo off
setlocal
start "" powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0launcher.ps1"
exit /b
