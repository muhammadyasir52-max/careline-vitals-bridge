#!/usr/bin/env node
// Simulates the device-capture app: a CareManager records a few vital
// readings (either "from a BLE device" or typed in manually) and the app
// syncs them to the cloud Ingestion API as a batch.
//
// Usage:
//   API_BASE=http://localhost:3000/api/v1 API_KEY=<tenant-api-key> node simulate.js

const API_BASE = process.env.API_BASE || 'http://localhost:3000/api/v1';
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error('Set API_KEY to a tenant API key (create a tenant via the admin portal first).');
  process.exit(1);
}

// A small set of sample readings, as if captured during one home visit.
const readings = [
  {
    patientId: 'patient-demo-1',
    deviceId: 'ble-thermometer-01',
    recordedBy: 'careManager-demo',
    vitalType: 'body_temperature',
    value: 37.4,
    unit: 'Cel',
    source: 'ble',
    timestamp: new Date().toISOString(),
  },
  {
    patientId: 'patient-demo-1',
    deviceId: 'ble-bp-cuff-01',
    recordedBy: 'careManager-demo',
    vitalType: 'blood_pressure_systolic',
    value: 122,
    unit: 'mmHg',
    source: 'ble',
    timestamp: new Date().toISOString(),
  },
  {
    patientId: 'patient-demo-1',
    deviceId: 'ble-bp-cuff-01',
    recordedBy: 'careManager-demo',
    vitalType: 'blood_pressure_diastolic',
    value: 78,
    unit: 'mmHg',
    source: 'ble',
    timestamp: new Date().toISOString(),
  },
  {
    patientId: 'patient-demo-1',
    deviceId: 'manual-entry',
    recordedBy: 'careManager-demo',
    vitalType: 'spo2',
    value: 97,
    unit: '%',
    source: 'manual',
    timestamp: new Date().toISOString(),
  },
];

async function main() {
  const res = await fetch(`${API_BASE}/vitals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY },
    body: JSON.stringify({ readings }),
  });
  const body = await res.json();
  console.log(`POST /vitals -> ${res.status}`);
  console.log(JSON.stringify(body, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
