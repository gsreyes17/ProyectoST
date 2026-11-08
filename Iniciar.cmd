@echo off
cd /d "%~dp0"
if not exist apps\app-seguridad\frontend\dist\index.html (
  call npm.cmd run build
  if errorlevel 1 exit /b 1
)
call npm.cmd run dev
pause