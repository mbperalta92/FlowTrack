@echo off
title REPFIX FlowTrack - Launcher
echo ===================================================
echo   A iniciar o REPFIX FlowTrack (Backend + Frontend)
echo ===================================================
echo.

cd /d "%~dp0"

echo [1/2] A iniciar o servidor Backend (porta 3001)...
start "REPFIX FlowTrack - Backend" cmd /k "cd /d "%~dp0server" && node server.js"

timeout /t 2 /nobreak >nul

echo [2/2] A iniciar o cliente Frontend (porta 5173)...
start "REPFIX FlowTrack - Frontend" cmd /k "cd /d "%~dp0client" && npm.cmd run dev"

timeout /t 3 /nobreak >nul

echo A abrir o navegador em http://localhost:5173 ...
start http://localhost:5173

echo.
echo FlowTrack iniciado com sucesso!

