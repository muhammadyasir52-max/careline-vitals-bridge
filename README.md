# CareLine Vitals Bridge

A multi-tenant platform for transmitting vital signs (temperature, blood
pressure, SpO2/pulse) from patient-facing devices into a hospital's EMR.
Designed as a sellable product (sold under the CareLine name): each customer
(tenant) configures their own EMR endpoint (FHIR R4, HL7 v2 over MLLP, or a
custom REST API) and their own devices, with full data isolation between
tenants.

See `../../plans` (or the conversation that produced this repo) for the full
system design and rationale.

## Packages

- **`packages/cloud-api`** — the core multi-tenant ingestion API: validation,
  normalization to FHIR R4 Observations (LOINC-coded), pluggable EMR
  adapters (FHIR / HL7v2 / custom REST), retry + dead-letter queue, audit log,
  and tenant management endpoints.
- **`packages/admin-portal`** — static web UI for onboarding tenants
  (configuring their EMR adapter) and viewing per-tenant data-flow dashboards.
- **`packages/mobile-capture`** — simulator for the device-capture app
  (BLE + manual entry) that posts sample readings to the ingestion API. The
  real Expo/React Native app would replace this with live BLE device support.
- **`packages/edge-agent`** — (not yet implemented) desktop agent for
  USB/serial-connected ward monitors.
- **`packages/emr-sim`** — a lightweight EMR simulator exposing the same
  FHIR R4 REST surface as OpenMRS/Bahmni (`/ws/fhir2/R4/Observation`,
  `/ws/fhir2/R4/Patient`), plus a patient-chart viewer. Used for demos and
  local testing without a full OpenMRS install — point the FHIR adapter's
  `baseUrl` at a real OpenMRS/Bahmni instance later with no code changes.

## Running locally (live device → EMR demo)

```bash
# 1. Start the cloud API (default port 3000)
cd packages/cloud-api
npm install
npm start

# 2. Start the EMR simulator (default port 6010)
cd ../emr-sim
npm install
npm start
# open http://localhost:6010 to see the patient chart viewer

# 3. Start the admin portal (default port 4000)
cd ../admin-portal
npm install
npm start
# open http://localhost:4000, create a tenant with:
#   EMR adapter type: FHIR R4
#   FHIR base URL: http://localhost:6010/ws/fhir2/R4

# 4. Simulate a device-capture sync for that tenant
cd ../mobile-capture
API_KEY=<apiKey from the admin portal> npm run simulate
# refresh http://localhost:6010 - the readings appear on the patient chart
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
