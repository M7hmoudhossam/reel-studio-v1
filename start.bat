@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 18 or newer is required. Install it from https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules\playwright goto setup
if not exist .setup-complete goto setup
goto launch
:setup
call npm run setup
if errorlevel 1 (
  echo Setup failed. Install Google Chrome and try again.
  pause
  exit /b 1
)
:launch
start "" /b cmd /c "timeout /t 3 /nobreak >nul & start http://127.0.0.1:4301/"
echo Reel Studio: http://127.0.0.1:4301/
node server.mjs
pause
