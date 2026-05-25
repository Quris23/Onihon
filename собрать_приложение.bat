@echo off
set "PATH=D:\NodeJs;%PATH%"

echo.
echo  ============================================
echo   Nihongo no Web  - Building .exe
echo  ============================================
echo.

echo  [1/2] Installing dependencies...
cd /d "D:\IT\Project\Nihongo no Web\electron"
if errorlevel 1 (
    echo  [ERROR] Folder not found: D:\IT\Project\Nihongo no Web\electron
    pause
    exit /b 1
)

"D:\NodeJs\npm.cmd" install
if errorlevel 1 (
    echo  [ERROR] npm install failed
    pause
    exit /b 1
)
echo  Done.
echo.

echo  [2/2] Building app...
set "CSC_IDENTITY_AUTO_DISCOVERY=false"
"D:\NodeJs\npm.cmd" run build
if errorlevel 1 (
    echo  [ERROR] Build failed
    pause
    exit /b 1
)

echo.
echo  ============================================
echo   Ready! Installer in: electron\dist\
echo  ============================================
echo.
pause
