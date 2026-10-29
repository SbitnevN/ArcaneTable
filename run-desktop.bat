@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === Arcane Table: build + launch ===
call npm run desktop
echo.
echo === Exit code: %ERRORLEVEL% ===
pause
