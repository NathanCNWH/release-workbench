@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24 is required. Install Node.js, then run this script again.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm.cmd install
  if errorlevel 1 exit /b 1
)
echo Open http://127.0.0.1:4173/ in your browser.
call npm.cmd run dev
