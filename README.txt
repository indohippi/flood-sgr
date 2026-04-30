# Flood Monitor Launcher Kit

Put these launcher files in the **same folder** as your flood monitor project files, where `package.json` lives.

## Easiest option
Double-click:

- `Launch-Flood-Monitor.bat`

That will:
1. check for Node.js
2. install dependencies if needed
3. start the server
4. wait a few seconds
5. open `http://localhost:3000`

## Files
- `Launch-Flood-Monitor.bat` = easiest Windows double-click launcher
- `Launch-Flood-Monitor.ps1` = PowerShell version

## Important
Keep the **server window** open while using the app.

## To make it feel like an app
You can create a desktop shortcut to `Launch-Flood-Monitor.bat` and rename it:
- San Gabriel Flood Monitor

If you want a real `.exe`, the next step is to wrap this launcher with a tool like:
- PS2EXE for PowerShell
- Bat To Exe Converter for batch
- or package the whole app with Electron

For your use case, the `.bat` launcher is the simplest and most dependable starting point.
