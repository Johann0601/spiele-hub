@echo off
REM Baut die App und veroeffentlicht sie als GitHub-Release.
REM VORHER: Versionsnummer in package.json erhoehen (z. B. 0.1.1 -> 0.1.2)!
REM Alle installierten Apps finden das Update dann von selbst.
cd /d "%~dp0"
for /f "delims=" %%t in ('gh auth token') do set GH_TOKEN=%%t
call npm run release
echo.
pause
