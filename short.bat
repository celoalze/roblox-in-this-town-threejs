@echo off
cd /d %~dp0
set SLUG=%1
shift
python pipeline\produce.py stories\%SLUG%\story.json %1 %2 %3 %4 %5 %6
