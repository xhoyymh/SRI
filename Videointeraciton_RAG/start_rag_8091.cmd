@echo off
cd /d "%~dp0"
".venv\Scripts\python.exe" rag_service.py --host 127.0.0.1 --port 8091
