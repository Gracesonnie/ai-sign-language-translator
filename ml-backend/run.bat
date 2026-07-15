@echo off
echo ============================================
echo SIGN RECOGNITION SYSTEM
echo ============================================
echo.
echo 1. Train Model
echo 2. Test Webcam
echo 3. Start API Server
echo 4. Exit
echo.
set /p choice="Select option (1-4): "

if "%choice%"=="1" (
    python train_model.py
    pause
    run.bat
)
if "%choice%"=="2" (
    python test_webcam.py
    pause
    run.bat
)
if "%choice%"=="3" (
    python app.py
    pause
    run.bat
)
if "%choice%"=="4" (
    exit
)