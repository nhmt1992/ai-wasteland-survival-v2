@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
set "LAUNCHER_VBS=%SCRIPT_DIR%launcher.vbs"

if not exist "%LAUNCHER_VBS%" (
  echo launcher.vbs was not found.
  pause
  exit /b 1
)

start "" /D "%SCRIPT_DIR%" wscript.exe //B //NoLogo "%LAUNCHER_VBS%"
exit /b
