@echo off

REM Go to the main project folder
cd /d "%~dp0"

REM Create .env if it does not exist
if not exist .env copy .env.example .env

REM Create Python virtual environment
if not exist .venv (
py -m venv .venv
)

REM Activate virtual environment
call .venv\Scripts\activate.bat

REM Install required Python libraries
python -m pip install -r requirements.txt

REM Start FastAPI server
python -m uvicorn Backend.main:app --reload

pause