@echo off
title TeamGachi Frontend Preview
cd /d "%~dp0"
start "" http://localhost:4174/html/index.html
call npx.cmd --yes serve . --listen 4174 --no-clipboard
pause
