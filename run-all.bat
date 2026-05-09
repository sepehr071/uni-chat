@echo off
REM Double-click launcher - menu picks mode, delegates to run-all.ps1.
setlocal

echo == uni-chat launcher ==
echo.
echo   [1] Full stack    - backend + frontend + bot + scheduler
echo   [2] Minimal       - backend + frontend only (no bot, no scheduler)
echo.

:choose
set /p choice=Enter 1 or 2:
if "%choice%"=="1" set MODE=full& goto run
if "%choice%"=="2" set MODE=minimal& goto run
echo Invalid choice.
goto choose

:run
pwsh.exe -ExecutionPolicy Bypass -File "%~dp0run-all.ps1" -Mode %MODE%
pause
