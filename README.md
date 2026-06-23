# CareLine Vitals Bridge

A platform for transmitting vital signs (temperature, blood pressure,
SpO2/pulse) from Bluetooth devices straight into a hospital's EMR. Sold
under the CareLine name.

**Deployment model: local, not cloud.** The Vitals Bridge (`cloud-api` +
`ble-capture-web`) runs on the same machine as the EMR — a background
service on the nursing station PC, talking over `localhost`. There's no
dependency on an internet connection or a hosted service for normal
operation. (A cloud/Render deployment is still available for remote
demos — see `render.yaml` — but it is not how this runs in a real
hospital.)

**Real-world workflow:**
1. A patient is pulled up on the EMR's demographics screen.
2. The nurse clicks **"Start Vitals"** — a small popup opens (the
   `ble-capture-web` app), already knowing which patient this is for
   (the EMR passes that via the popup's URL — no retyping a patient ID).
3. The nurse connects each BLE device (or types a value in manually if a
   device isn't available) — temperature, BP, SpO2/pulse populate live
   in the popup.
4. She clicks **"Send to EMR"** — the readings are normalized to FHIR R4
   Observations and pushed into the EMR, which reflects them immediately.

See `../../plans` (or the conversation that produced this repo) for the
full system design and rationale.

## Packages

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

**Alongside a real EMR** (production-style — no simulator/admin portal
needed once a tenant is configured):

```bash
# Windows: double-click, or from a terminal:
start-local.bat
```

Starts `cloud-api` (port 3000) and `ble-capture-web` (port 7000) as
background processes. The EMR's "Start Vitals" button should open
`http://localhost:7000/?patientId=<id>&recordedBy=<name>`.

**Full local demo stack** (EMR simulator + admin portal, for testing
without a real EMR):

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
# it opens the capture app with that patient pre-selected.
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
