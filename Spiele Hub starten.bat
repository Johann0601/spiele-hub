@echo off
title Spiele Hub
cd /d "%~dp0"
echo ============================================
echo   Spiele Hub wird gestartet ...
echo   (Dieses Fenster bitte offen lassen,
echo    solange du die App benutzt.)
echo ============================================
echo.
call npm run dev
echo.
echo Spiele Hub wurde beendet. Du kannst dieses Fenster schliessen.
pause
