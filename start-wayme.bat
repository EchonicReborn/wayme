@echo off
REM ============================================
REM WAYME - one-click starter
REM Opens two windows: the backend server, and
REM the public ngrok tunnel pointing at it.
REM ============================================

start "WAYME Server" cmd /k "cd /d D:\wayme web live\wayme_7\wayme\server && npm start"
timeout /t 3
start "WAYME Tunnel" cmd /k "npx ngrok http 3000"

echo.
echo Both windows are starting...
echo Server: http://localhost:3000
echo Tunnel: https://suffering-relearn-unpinned.ngrok-free.dev
echo.
echo Once both windows show they're running, your live site is ready at:
echo https://echonicreborn.github.io/wayme/admin-app/index.html
echo.
pause