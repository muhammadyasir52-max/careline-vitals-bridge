const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const express = require('express');

const CLOUD_API_PORT = 3000;
const BLE_CAPTURE_PORT = 7000;
const TRIGGER_PORT = 7050;

let mainWindow = null;
let tray = null;
let chooserWindow = null;
let pendingBluetoothCallback = null;
let backendProcesses = [];

// ─── Backend processes (hidden — no console window, no taskbar entry) ─────────
// The customer's IT team installs this once; from then on, both the
// ingestion API and the BLE capture page run invisibly as children of this
// app. Nothing here is shown to the nurse or opened in a browser.

// Spawns `node <entryFile>` directly rather than going through `npm start` -
// npm.cmd on Windows wraps the real node.exe in a child process, so killing
// the npm wrapper on app quit leaves the actual server running as an orphan.
// Spawning node directly means child.kill() actually stops it.
function spawnHidden(cwd, entryFile) {
  const child = spawn(process.execPath, [entryFile], {
    cwd,
    windowsHide: true,
    stdio: 'ignore',
  });
  backendProcesses.push(child);
  return child;
}

function startBackend() {
  spawnHidden(path.join(__dirname, '..', '..', 'cloud-api'), 'src/server.js');
  spawnHidden(path.join(__dirname, '..', '..', 'ble-capture-web'), 'server.js');
}

function stopBackend() {
  for (const child of backendProcesses) {
    try { child.kill(); } catch {}
  }
  backendProcesses = [];
}

// ─── Main window ────────────────────────────────────────────────────────────
// A native window — no address bar, no tabs, no browser UI of any kind.
// Hidden until the EMR triggers it via the local HTTP endpoint below.

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    title: 'CareLine Vitals Bridge',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  // Keep running in the background instead of quitting when closed.
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Handle Web Bluetooth's device chooser ourselves — Electron does not show
  // Chrome's built-in picker UI, so without this navigator.bluetooth calls
  // in the capture page would hang forever waiting for a device selection.
  mainWindow.webContents.session.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault();
    pendingBluetoothCallback = callback;
    showBluetoothChooser(deviceList);
  });
}

function navigateToVitals(patientId, recordedBy) {
  const url = new URL(`http://localhost:${BLE_CAPTURE_PORT}/`);
  if (patientId) url.searchParams.set('patientId', patientId);
  if (recordedBy) url.searchParams.set('recordedBy', recordedBy);
  mainWindow.loadURL(url.toString());
  mainWindow.show();
  mainWindow.focus();
}

function showDeviceSetupWindow() {
  mainWindow.loadURL(`http://localhost:${BLE_CAPTURE_PORT}/`);
  mainWindow.show();
  mainWindow.focus();
  // The capture app's own routing will land on Settings/Device Setup since
  // there's no patientId — exactly the screen IT staff need for one-time pairing.
}

// ─── Bluetooth device chooser (replaces Chrome's built-in picker) ────────────

function showBluetoothChooser(deviceList) {
  if (chooserWindow) {
    chooserWindow.webContents.send('device-list', deviceList);
    return;
  }

  chooserWindow = new BrowserWindow({
    width: 380,
    height: 420,
    parent: mainWindow,
    modal: true,
    autoHideMenuBar: true,
    title: 'Select Bluetooth device',
    webPreferences: {
      preload: path.join(__dirname, 'chooserPreload.js'),
      contextIsolation: true,
    },
  });

  chooserWindow.setMenuBarVisibility(false);
  chooserWindow.loadFile(path.join(__dirname, 'chooser.html'));

  chooserWindow.webContents.once('did-finish-load', () => {
    chooserWindow.webContents.send('device-list', deviceList);
  });

  chooserWindow.on('closed', () => {
    chooserWindow = null;
    if (pendingBluetoothCallback) {
      pendingBluetoothCallback(''); // treat closing the window as "cancel"
      pendingBluetoothCallback = null;
    }
  });
}

ipcMain.on('bluetooth-device-selected', (event, deviceId) => {
  if (pendingBluetoothCallback) {
    pendingBluetoothCallback(deviceId);
    pendingBluetoothCallback = null;
  }
  if (chooserWindow) {
    chooserWindow.removeAllListeners('closed');
    chooserWindow.close();
    chooserWindow = null;
  }
});

// ─── Local trigger server ─────────────────────────────────────────────────────
// What the EMR actually calls. No popup, no Chrome - just a background HTTP
// request to an app that's already running, asking it to show itself for a
// given patient.

function startTriggerServer() {
  const triggerApp = express();

  triggerApp.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
  });

  triggerApp.get('/start-vitals', (req, res) => {
    navigateToVitals(req.query.patientId, req.query.recordedBy);
    res.json({ status: 'ok' });
  });

  triggerApp.get('/device-setup', (req, res) => {
    showDeviceSetupWindow();
    res.json({ status: 'ok' });
  });

  triggerApp.get('/health', (req, res) => res.json({ status: 'ok' }));

  triggerApp.listen(TRIGGER_PORT, '127.0.0.1');
}

// ─── Tray icon ────────────────────────────────────────────────────────────────

// A solid green square, built as a raw BGRA bitmap rather than an encoded
// image file - avoids needing a separate icon asset or risking a malformed
// hand-written PNG.
function buildTrayIcon() {
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buffer[i * 4] = 0x20;     // B
    buffer[i * 4 + 1] = 0x5e; // G
    buffer[i * 4 + 2] = 0x1b; // R  (CareLine green, #1b5e20)
    buffer[i * 4 + 3] = 0xff; // A
  }
  return nativeImage.createFromBitmap(buffer, { width: size, height: size });
}

function createTray() {
  let icon;
  try {
    icon = buildTrayIcon();
  } catch {
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon);
  tray.setToolTip('CareLine Vitals Bridge — running in background');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Pair devices…', click: () => showDeviceSetupWindow() },
    { label: 'Show window', click: () => mainWindow.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  startBackend();
  createMainWindow();
  createTray();
  startTriggerServer();
});

app.on('window-all-closed', (event) => {
  // Never quit when the window closes - this is a background service.
  event.preventDefault();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopBackend();
});
