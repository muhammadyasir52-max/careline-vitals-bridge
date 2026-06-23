# CareLine Vitals Bridge

A platform for transmitting vital signs (temperature, blood pressure,
SpO2/pulse) from Bluetooth devices straight into a hospital's EMR. Sold
under the CareLine name.

**Deployment model: local desktop app, not cloud, not a browser tab.**
`packages/desktop-app` is what actually runs at a hospital — a native
window with no address bar or browser chrome, that silently runs the
backend in the background and stays in the system tray. IT installs it
once; nobody else ever opens a terminal or a browser again. (A cloud/Render
deployment is still available for remote demos — see `render.yaml` — but
it is not how this runs in a real hospital.)

**Real-world workflow:**
1. IT installs the desktop app once, configures the API connection, and
   pairs the three Bluetooth devices (one-time, via the tray icon's "Pair
   devices…" menu). From this point on, nobody touches the app directly.
2. A patient is pulled up on the EMR's demographics screen. The nurse
   clicks **"Start Vitals"**.
3. The EMR makes a plain background HTTP call to the already-running
   desktop app (`http://localhost:7050/start-vitals?patientId=...`) — no
   popup, no browser window. The app brings its own native window to the
   foreground for that patient.
4. The paired devices reconnect automatically; temperature, BP, SpO2/pulse
   populate live as the nurse takes each reading (or she types a value
   manually if a device isn't available).
5. She clicks **"Send to EMR"** — the readings are normalized to FHIR R4
   Observations and pushed into the EMR, which reflects them immediately.

See `../../plans` (or the conversation that produced this repo) for the
full system design and rationale.

## Packages

- **`packages/desktop-app`** — the actual deployed artifact: an Electron
  app with no browser chrome that runs `cloud-api` + `ble-capture-web` as
  hidden background processes, exposes a local trigger HTTP endpoint for
  the EMR to call (no popup window), and implements its own Bluetooth
  device picker. See `packages/desktop-app/README.md`.
- **`packages/cloud-api`** — the ingestion API: validation, normalization
  to FHIR R4 Observations (LOINC-coded), pluggable EMR adapters (FHIR /
  HL7v2 / custom REST), retry + dead-letter queue, audit log, and tenant
  management endpoints. (Multi-tenant under the hood, but a real
  deployment typically configures one tenant per hospital site.)
- **`packages/ble-capture-web`** — the nurse-facing capture app (Web
  Bluetooth, runs in Chrome/Edge). Confirmed working against three real
  devices: **DET-1015B** (infrared thermometer), **PC-60FW** (pulse
  oximeter), **ALPHAMED U807** (BP monitor) — see `public/app.js` for the
  reverse-engineered protocols. Always launched with a `patientId` from
  the EMR; has no manual "type in a patient" flow in normal use.
- **`packages/emr-sim`** — a lightweight EMR simulator exposing the same
  FHIR R4 REST surface as OpenMRS/Bahmni (`/ws/fhir2/R4/Observation`,
  `/ws/fhir2/R4/Patient`), with a patient-chart viewer and a "Start
  Vitals" button that mimics the real EMR integration. Used for local
  testing without a real EMR — point the FHIR adapter's `baseUrl` at a
  real OpenMRS/Bahmni instance later with no code changes.
- **`packages/admin-portal`** — static web UI for onboarding a tenant
  (configuring the EMR adapter once during install) and viewing
  data-flow dashboards.
- **`packages/mobile-capture`** — a scripted simulator (not the real
  capture app) for posting sample readings without any hardware; useful
  for backend testing only.
- **`packages/edge-agent`** — (not yet implemented) desktop agent for
  USB/serial-connected ward monitors.

## Running locally

**The actual deployment** (production-style):

```bash
cd packages/desktop-app && npm install
# Windows: double-click start-desktop-app.bat, or:
npm start
```

Runs as a native window + system tray icon. First launch: configure the
API connection and pair the three devices via the tray menu's "Pair
devices…". After that, point the real EMR's "Start Vitals" action at
`http://localhost:7050/start-vitals?patientId=<id>&recordedBy=<name>`
(a plain HTTP call — no popup window needed).

**Full local demo stack** (EMR simulator + admin portal, for testing
without a real EMR — runs everything as plain Node processes instead of
the Electron app, useful when iterating on backend code):

```bash
start-demo.bat
```

Or run each manually:

```bash
# 1. Cloud API (port 3000)
cd packages/cloud-api && npm install && npm start

# 2. EMR Simulator (port 6010)
cd packages/emr-sim && npm install && npm start
# open http://localhost:6010

# 3. Admin portal (port 4000) - one-time tenant setup
cd packages/admin-portal && npm install && npm start
# open http://localhost:4000, create a tenant with:
#   EMR adapter type: FHIR R4
#   FHIR base URL: http://localhost:6010/ws/fhir2/R4
# copy the generated API key into the BLE capture app's one-time Settings screen

# 4. BLE capture app (port 7000)
cd packages/ble-capture-web && npm install && npm start
# open http://localhost:6010, click "Start Vitals" on a patient -
# this calls the trigger endpoint (or opens the capture app directly if
# the desktop app isn't running) with that patient pre-selected.
```

## Testing

```bash
cd packages/cloud-api
npm test
```

Covers:
- Normalization of all supported vital types to FHIR R4 Observations with
  correct LOINC codes, unit conversion, and range validation.
- Each EMR adapter (FHIR, HL7v2/MLLP, custom REST) against mock servers.
- End-to-end ingestion API tests: auth, tenant isolation, dashboards, and the
  retry → dead-letter → redelivery failure-mode flow.
