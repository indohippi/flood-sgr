@echo off
setlocal ENABLEDELAYEDEXPANSION
title San Gabriel Flood Monitor Launcher

cd /d "%~dp0"

echo.
echo ==========================================
echo   San Gabriel Flood Monitor Launcher
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or not available in PATH.
  echo Please install Node.js LTS first, then run this launcher again.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is not available.
  echo Please reinstall Node.js LTS, then run this launcher again.
  echo.
  pause
  exit /b 1
)

if not exist package.json (
  echo package.json was not found in this folder.
  echo Put this launcher inside your flood monitor project folder.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing required files for the first run...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo.
echo Starting server in a new window...
start "Flood Monitor Server" cmd /k "cd /d ""%~dp0"" && npm start"

echo Waiting for server to start...
timeout /t 8 /nobreak >nul

echo Opening dashboard...
start "" http://localhost:3000

echo.
echo The dashboard should open in your browser.
echo Keep the server window open while using the app.
echo.
pause
