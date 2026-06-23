@echo off
REM Starts the CareLine Vitals Bridge desktop app - this is what actually
REM runs at a customer site. It's a native window (no browser, no address
REM bar) that silently starts the backend in the background and waits for
REM the EMR to trigger it. IT installs this once; nobody else ever needs to
REM run a command or open a terminal again.

cd packages\desktop-app
call npm start
