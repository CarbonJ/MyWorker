@echo off
:: ─────────────────────────────────────────────────────────────────────────────
:: launch-myworker.bat
:: Starts MyWorker on http://localhost:3000 using Python's built-in web server.
::
:: Place this file in the same folder as the MyWorker app files (index.html etc).
:: Double-click to launch. Chrome opens automatically.
:: Close this window to stop the server.
:: ─────────────────────────────────────────────────────────────────────────────

title MyWorker

:: Change to the folder this .bat file lives in (so Python serves the right files)
cd /d "%~dp0"

echo.
echo  Starting MyWorker...
echo  Address: http://localhost:3000
echo  Close this window to stop the server.
echo.

:: Open the browser after a 2-second delay (runs in background, non-blocking)
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

:: Start the Python web server (blocking — keeps window open)
python3 -m http.server 3000 2>nul
if %errorlevel% neq 0 python -m http.server 3000

pause
