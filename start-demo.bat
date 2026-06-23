@echo off
REM Starts the full local demo stack, including the EMR Simulator and admin
REM portal - use this for testing/demos when there's no real EMR to
REM integrate with yet. For an actual deployment alongside a real EMR, use
REM start-local.bat instead (it skips the simulator and admin portal).

echo Starting CareLine Vitals Bridge (full local demo stack)...

start "CareLine Vitals Bridge - API" /min cmd /c "cd packages\cloud-api && npm start"
start "CareLine EMR Simulator" /min cmd /c "cd packages\emr-sim && npm start"
start "CareLine Vitals Bridge - Admin Portal" /min cmd /c "cd packages\admin-portal && npm start"
start "CareLine Vitals Bridge - BLE Capture" /min cmd /c "cd packages\ble-capture-web && npm start"

echo.
echo Vitals Bridge API:   http://localhost:3000
echo EMR Simulator:        http://localhost:6010
echo Admin portal:         http://localhost:4000
echo BLE Capture app:      http://localhost:7000
echo.
echo All four are running in minimized background windows. Close those
echo windows (or log off) to stop them.
