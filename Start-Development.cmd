@echo off
setlocal
cd /d "%~dp0"
set "ELECTRON_RUN_AS_NODE="
start "Spine Physics Presets Development" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0." %*
endlocal