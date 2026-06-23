@echo off
REM Starts the CareLine Vitals Bridge services that run alongside a real EMR
REM on the same machine: the cloud-api (ingestion + EMR adapters) and the
REM BLE capture app. No internet/cloud dependency - everything talks over
REM localhost. Run this once when the nursing station PC starts up (or set
REM it up as a scheduled task / startup item) and leave it running in the
REM background; the EMR's "Start Vitals" button opens the capture app.

echo Starting CareLine Vitals Bridge (local mode)...

start "CareLine Vitals Bridge - API" /min cmd /c "cd packages\cloud-api && npm start"
start "CareLine Vitals Bridge - BLE Capture" /min cmd /c "cd packages\ble-capture-web && npm start"

echo.
echo Vitals Bridge API:   http://localhost:3000
echo BLE Capture app:     http://localhost:7000
echo.
echo Both are running in minimized background windows. Close those windows
echo (or log off) to stop them.
