@echo off
chcp 65001 >nul
title JAZMINE - Recovery Tool
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-recovery-tool.ps1"
if errorlevel 1 pause
