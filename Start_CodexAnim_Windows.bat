@echo off
setlocal
cd /d "%~dp0app\src\main\assets"
where py >nul 2>nul
if %errorlevel%==0 (
  start "" "http://127.0.0.1:8765"
  py -3 -m http.server 8765 --bind 127.0.0.1
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (
    start "" "http://127.0.0.1:8765"
    python -m http.server 8765 --bind 127.0.0.1
  ) else (
    echo Python 3 non trovato. Apro HTML direttamente nel browser.
    start "" "%~dp0app\src\main\assets\index.html"
  )
)
