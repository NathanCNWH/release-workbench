@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop.ps1"
set code=%ERRORLEVEL%
if not "%code%"=="0" pause
exit /b %code%
