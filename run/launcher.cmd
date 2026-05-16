@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

if not exist "%POWERSHELL_EXE%" (
  for %%P in (pwsh.exe powershell.exe) do (
    where %%P >nul 2>nul
    if not errorlevel 1 (
      set "POWERSHELL_EXE=%%~$PATH:P"
      goto :launch
    )
  )
  echo PowerShell was not found.
  pause
  exit /b 1
)

:launch
start "" /D "%SCRIPT_DIR%" "%POWERSHELL_EXE%" -NoLogo -NoProfile -ExecutionPolicy Bypass -STA -File "%SCRIPT_DIR%launcher.ps1"
exit /b
