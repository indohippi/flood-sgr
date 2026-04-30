$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  San Gabriel Flood Monitor Launcher" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Install Node.js LTS first, then run this launcher again." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "npm is not available." -ForegroundColor Red
    Write-Host "Reinstall Node.js LTS, then run this launcher again." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

if (-not (Test-Path ".\package.json")) {
    Write-Host "package.json was not found in this folder." -ForegroundColor Red
    Write-Host "Put this launcher inside your flood monitor project folder." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

if (-not (Test-Path ".\node_modules")) {
    Write-Host "Installing required files for the first run..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "npm install failed." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

Write-Host "Starting server in a new window..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; npm start"

Write-Host "Waiting for server to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 8

Write-Host "Opening dashboard..." -ForegroundColor Green
Start-Process "http://localhost:3000"

Write-Host ""
Write-Host "The dashboard should open in your browser." -ForegroundColor Green
Write-Host "Keep the server window open while using the app." -ForegroundColor Yellow
Write-Host ""
Read-Host "Press Enter to close this launcher window"
