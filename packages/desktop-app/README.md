# CareLine Vitals Bridge — Desktop App

This is what actually runs at a hospital. It's a native Electron window —
no address bar, no tabs, no browser chrome of any kind — that:

1. **Silently starts the backend** (`cloud-api` + `ble-capture-web`) as
   hidden background processes when it launches. No console windows, no
   visible terminals.
2. **Stays hidden in the system tray** until needed. Closing its window
   doesn't quit it — it just hides, the same as any background service.
3. **Exposes a local trigger endpoint** (`http://localhost:7050/start-vitals`)
   that the EMR calls with a plain HTTP request — no popup, no browser
   window opened by the EMR at all. The already-running app just brings
   itself to the foreground for that patient.
4. **Implements its own Bluetooth device picker** (`src/chooser.html`),
   since Electron — unlike Chrome — doesn't show one automatically for
   `navigator.bluetooth.requestDevice()`.

## Running

```bash
npm install
npm start
```

Or from the repo root: `start-desktop-app.bat`.

## How the EMR integrates with it

The EMR's "Start Vitals" button should make a plain HTTP request (no popup
window, no `window.open`):

```js
fetch(`http://localhost:7050/start-vitals?patientId=${id}&recordedBy=${name}`);
```

See `packages/emr-sim/public/app.js`'s `startVitals()` for the reference
implementation.

## One-time IT setup

The system tray icon's right-click menu has **"Pair devices…"** — this opens
the same window used for normal vitals capture, but routed to the device
pairing screen (since there's no `patientId` to navigate to). IT does this
once per device, then never touches it again; the desktop app keeps the
paired permission for all future launches.

## Packaging into an installer

This currently runs via `npm start` (good enough to test/demo). For an
actual customer rollout, the next step is packaging it into a real Windows
installer with `electron-builder` or `electron-forge` — not yet wired up
here, but `main.js` doesn't need any changes for that; it's purely a
packaging/build step.
