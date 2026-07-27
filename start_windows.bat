@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "APP_URL=http://127.0.0.1:5000"
set "PYTHON_EXE=%CD%\.venv\Scripts\python.exe"

echo.
echo === Lin Tools Windows Launcher ===
echo Project dir: %CD%
echo.

if not exist "%PYTHON_EXE%" (
    echo [1/5] Creating virtual environment: .venv
    where py >nul 2>nul
    if not errorlevel 1 (
        py -3 -m venv .venv
    ) else (
        where python >nul 2>nul
        if errorlevel 1 (
            echo ERROR: Python was not found. Install Python 3.10+ and enable "Add python.exe to PATH".
            goto :fail
        )
        python -m venv .venv
    )
    if errorlevel 1 goto :fail
) else (
    echo [1/5] Found virtual environment: .venv
)

echo [2/5] Installing Python package and dependencies...
"%PYTHON_EXE%" -m pip install -e .
if errorlevel 1 goto :fail

if exist "%CD%\frontend\package.json" (
    if not exist "%CD%\frontend\node_modules" (
        echo [3/5] Installing frontend dependencies...
        where npm >nul 2>nul
        if errorlevel 1 (
            echo ERROR: npm was not found. Install Node.js, or keep an existing frontend\dist build.
            goto :fail
        )
        pushd "%CD%\frontend"
        call npm install
        if errorlevel 1 (
            popd
            goto :fail
        )
        popd
    ) else (
        echo [3/5] Found frontend dependencies: frontend\node_modules
    )

    if not exist "%CD%\frontend\dist\index.html" (
        echo [4/5] Building frontend...
        where npm >nul 2>nul
        if errorlevel 1 (
            echo ERROR: npm was not found, so the frontend cannot be built.
            goto :fail
        )
        pushd "%CD%\frontend"
        call npm run build
        if errorlevel 1 (
            popd
            goto :fail
        )
        popd
    ) else (
        echo [4/5] Found frontend build: frontend\dist
    )
) else (
    echo [3/5] frontend\package.json was not found; skipping frontend dependencies.
    echo [4/5] Skipping frontend build.
)

if /I "%~1"=="--check" (
    echo [5/5] Check completed. Service was not started.
    exit /b 0
)

echo [5/5] Starting web server...
echo Browser URL: %APP_URL%
echo Close this window to stop the service.
echo.
start "" "%APP_URL%"
"%PYTHON_EXE%" run_web.py
if errorlevel 1 goto :fail

exit /b 0

:fail
echo.
echo Startup failed. Please check the error above.
pause
exit /b 1
