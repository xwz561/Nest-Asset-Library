@echo off
setlocal
set "TEAM_LIBRARY_INSTALL_SCRIPT=%~dp0Install-TeamLibraryTask.ps1"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath powershell.exe -Verb RunAs -Wait -ArgumentList ('-NoLogo -NoProfile -ExecutionPolicy Bypass -File ' + [char]34 + $env:TEAM_LIBRARY_INSTALL_SCRIPT + [char]34)"
