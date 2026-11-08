@echo off
cd /d "%~dp0"
if not exist apps\app-seguridad\frontend\dist\index.html (
  call pnpm.cmd run build
  if errorlevel 1 exit /b 1
)
call pnpm.cmd run dev
pause