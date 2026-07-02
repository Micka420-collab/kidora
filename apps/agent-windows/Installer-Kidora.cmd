@echo off
setlocal
title Kidora - Installation

rem  Double-cliquez ce fichier pour installer l'agent Kidora sur le PC de l'enfant.
rem  Il se relance en administrateur puis lance l'assistant guide (setup-windows.ps1).

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  echo   Elevation des privileges administrateur...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-windows.ps1" %*
set EXITCODE=%errorlevel%

echo.
if %EXITCODE% neq 0 (
  echo   L'installation a rencontre un probleme. Consultez les messages ci-dessus.
)
echo   Appuyez sur une touche pour fermer cette fenetre.
pause >nul
endlocal
