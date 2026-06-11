@echo off
cd /d "%~dp0"
java @target\run-backend.args --spring.profiles.active=local
