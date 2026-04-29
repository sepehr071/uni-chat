@echo off
REM Double-click launcher — delegates to run-all.ps1.
pwsh.exe -ExecutionPolicy Bypass -File "%~dp0run-all.ps1"
pause
