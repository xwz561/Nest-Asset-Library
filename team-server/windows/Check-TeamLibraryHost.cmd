@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Check-TeamLibraryHost.ps1"
echo.
pause
