@echo off
title Nihongo no Web
pushd "%~dp0"

set "PYTHON=D:\PR\python files\python.exe"
set "VENV=%~dp0.venv"

echo.
echo  ============================================
echo   Nihongo no Web  ^|  Starting server...
echo  ============================================
echo.

"%PYTHON%" --version > nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python not found at:
    echo  %PYTHON%
    pause
    exit /b 1
)

if not exist "%VENV%\Scripts\python.exe" (
    echo  [1/3] Creating virtual environment...
    "%PYTHON%" -m venv "%VENV%"
    if errorlevel 1 (
        echo  [ERROR] Failed to create venv.
        pause
        exit /b 1
    )
    echo         Done.
    echo.
)

echo  [2/3] Installing dependencies...
"%VENV%\Scripts\pip" install -q --upgrade pip
"%VENV%\Scripts\pip" install -q -r "%~dp0requirements.txt"
echo         Done.
echo.

echo  [3/3] Starting server...
echo.
echo  -----------------------------------------------
echo   Site : http://localhost:8000
echo   API  : http://localhost:8000/docs
echo   Stop : Ctrl + C
echo  -----------------------------------------------
echo.

start /b cmd /c "timeout /t 2 > nul && start http://localhost:8000"

"%VENV%\Scripts\uvicorn" main:app --host 127.0.0.1 --port 8000 --reload

pause
