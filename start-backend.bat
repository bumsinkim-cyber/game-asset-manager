@echo off
cd /d "%~dp0backend"
if not exist .env copy .env.example .env
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
