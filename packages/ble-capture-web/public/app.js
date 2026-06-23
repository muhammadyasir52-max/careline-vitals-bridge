// ─── Bluetooth GATT UUIDs (Bluetooth SIG standard health profiles) ───────────
// These work with most compliant BLE vital sign devices.
// Vendor-specific overrides can be added to VENDOR_PROFILES below.

const GATT = {
  HEALTH_THERMOMETER_SERVICE:    '00001809-0000-1000-8000-00805f9b34fb',
  TEMPERATURE_MEASUREMENT:       '00002a1c-0000-1000-8000-00805f9b34fb',

  BLOOD_PRESSURE_SERVICE:        '00001810-0000-1000-8000-00805f9b34fb',
  BLOOD_PRESSURE_MEASUREMENT:    '00002a35-0000-1000-8000-00805f9b34fb',

  PLX_SERVICE:                   '00001822-0000-1000-8000-00805f9b34fb',
  PLX_SPOT_CHECK:                '00002a5f-0000-1000-8000-00805f9b34fb',
  PLX_CONTINUOUS:                '00002a5e-0000-1000-8000-00805f9b34fb',

  // Common proprietary "serial-over-BLE" services used by cheap Chinese OEM
  // medical devices (DET-1015B, PC-60FW, ALPHAMED U807 and similar are
  // strong candidates for one of these, since each vendor layers its own
  // binary protocol on top of a generic UART-style transport).
  ISSC_SERVICE:                  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  ISSC_NOTIFY:                   '49535343-1e4d-4bd9-ba61-23c647249616',
  ISSC_WRITE:                    '49535343-8841-43f4-a8d4-ecbe34729bb3',

  HM_SERVICE:                    '0000ffe0-0000-1000-8000-00805f9b34fb',
  HM_NOTIFY:                     '0000ffe1-0000-1000-8000-00805f9b34fb',

  GENERIC_FFF0_SERVICE:          '0000fff0-0000-1000-8000-00805f9b34fb',
  GENERIC_FFF0_NOTIFY:           '0000fff1-0000-1000-8000-00805f9b34fb',
  GENERIC_FFF0_WRITE:            '0000fff2-0000-1000-8000-00805f9b34fb',
};

// All service UUIDs we might want to read post-connection, regardless of
// whether the device advertised them. Used as optionalServices so Web
// Bluetooth lets us access them after the user picks the device.
const ALL_KNOWN_SERVICES = [
  GATT.HEALTH_THERMOMETER_SERVICE, GATT.BLOOD_PRESSURE_SERVICE, GATT.PLX_SERVICE,
  GATT.ISSC_SERVICE, GATT.HM_SERVICE, GATT.GENERIC_FFF0_SERVICE,
  '0000180a-0000-1000-8000-00805f9b34fb', // Device Information
  '0000180f-0000-1000-8000-00805f9b34fb', // Battery Service
];

// ─── Vendor-specific profile overrides ───────────────────────────────────────
// Confirmed devices for this deployment: DET-1015B (thermometer), PC-60FW
// (oximeter), ALPHAMED U807 (BP monitor). None of these are documented to
// reliably implement the standard Bluetooth SIG health profiles above — they
// likely use one of the proprietary UART services. Exact byte parsing is
// filled in here once confirmed via the diagnostic scan (see diagScan below).
const VENDOR_PROFILES = {
  // det_1015b_thermometer: { serviceUUID: GATT.ISSC_SERVICE, charUUID: GATT.ISSC_NOTIFY, parse: ... },
  // pc_60fw_oximeter:      { serviceUUID: GATT.GENERIC_FFF0_SERVICE, charUUID: GATT.GENERIC_FFF0_NOTIFY, parse: ... },
  // alphamed_u807_bp:      { serviceUUID: GATT.ISSC_SERVICE, charUUID: GATT.ISSC_NOTIFY, parse: ... },
};

// ─── IEEE 11073 float parsing ─────────────────────────────────────────────────
// Used by Temperature Measurement (0x2A1C) and Blood Pressure (0x2A35).

function parseSFLOAT(raw) {
  // 16-bit: top 4 bits = signed exponent, bottom 12 bits = signed mantissa
  const exp = raw >> 12;
  let mantissa = raw & 0x0FFF;
  if (mantissa >= 0x0800) mantissa -= 0x1000;
  const signedExp = exp >= 8 ? exp - 16 : exp;
  if (mantissa === 0x07FF || mantissa === 0x0800 || mantissa === 0x07FE) return null; // NaN/inf
  return mantissa * Math.pow(10, signedExp);
}

function parseFLOAT(view, offset) {
  // 32-bit IEEE 11073 FLOAT: byte[0]=exponent(signed), bytes[1-3]=mantissa(signed 24-bit)
  const exponent = view.getInt8(offset + 3);
  const mantissa = view.getUint8(offset) |
                   (view.getUint8(offset + 1) << 8) |
                   (view.getUint8(offset + 2) << 16);
  const signed = mantissa >= 0x800000 ? mantissa - 0x1000000 : mantissa;
  if (signed === 0x7FFFFF || signed === -0x800000) return null; // NaN
  return signed * Math.pow(10, exponent);
}

// ─── Characteristic parsers ───────────────────────────────────────────────────

function parseTemperature(dataView) {
  const flags = dataView.getUint8(0);
  const isFahrenheit = flags & 0x01;
  const value = parseFLOAT(dataView, 1);
  if (value === null) return null;
  return {
    vitalType: 'body_temperature',
    value,
    unit: isFahrenheit ? 'degF' : 'Cel',
  };
}

function parseBloodPressure(dataView) {
  const flags = dataView.getUint8(0);
  const isKPa = flags & 0x01;
  const systolic  = parseSFLOAT(dataView.getUint16(1, true));
  const diastolic = parseSFLOAT(dataView.getUint16(3, true));
  const hasPulse  = flags & 0x04;
  const pulse     = hasPulse ? parseSFLOAT(dataView.getUint16(14, true)) : null;

  if (systolic === null || diastolic === null) return null;
  const unit = isKPa ? 'kPa' : 'mmHg';
  const readings = [
    { vitalType: 'blood_pressure_systolic',  value: systolic,  unit },
    { vitalType: 'blood_pressure_diastolic', value: diastolic, unit },
  ];
  if (pulse !== null) readings.push({ vitalType: 'pulse_rate', value: pulse, unit: '/min' });
  return readings;
}

function parsePlxSpotCheck(dataView) {
  const flags = dataView.getUint8(0);
  const spo2  = parseSFLOAT(dataView.getUint16(1, true));
  const pulse = parseSFLOAT(dataView.getUint16(3, true));
  if (spo2 === null || pulse === null) return null;
  return [
    { vitalType: 'spo2',       value: spo2,  unit: '%' },
    { vitalType: 'pulse_rate', value: pulse, unit: '/min' },
  ];
}

// ─── App state ────────────────────────────────────────────────────────────────

let cfg = {};
const pendingReadings = [];    // flat array of reading objects
const connectedDevices = {};   // type -> BLE device

// ─── Setup ────────────────────────────────────────────────────────────────────

document.getElementById('setup-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  cfg = {
    apiBase:    fd.get('apiBase').replace(/\/$/, ''),
    apiKey:     fd.get('apiKey').trim(),
    patientId:  fd.get('patientId').trim(),
    recordedBy: fd.get('recordedBy').trim() || 'CareManager',
  };
  localStorage.setItem('careline_cfg', JSON.stringify(cfg));
  showCapture();
});

function showCapture() {
  document.getElementById('screen-setup').classList.remove('active');
  document.getElementById('screen-capture').classList.add('active');
  document.getElementById('capture-subtitle').textContent = `Patient: ${cfg.patientId}`;
  if (!navigator.bluetooth) {
    document.querySelector('main').insertAdjacentHTML('afterbegin',
      `<div class="no-ble-warning">⚠️ Web Bluetooth is not available in this browser.
       Use <strong>Chrome</strong> or <strong>Edge</strong> on Android or Windows.
       Manual entry is still available below.</div>`);
    document.querySelectorAll('.btn-ble').forEach(b => b.disabled = true);
  }
}

function showSetup() {
  document.getElementById('screen-capture').classList.remove('active');
  document.getElementById('screen-setup').classList.add('active');
}

// Restore saved config
const saved = localStorage.getItem('careline_cfg');
if (saved) {
  try {
    const s = JSON.parse(saved);
    const f = document.getElementById('setup-form');
    f.apiBase.value    = s.apiBase    || f.apiBase.value;
    f.apiKey.value     = s.apiKey     || '';
    f.patientId.value  = s.patientId  || '';
    f.recordedBy.value = s.recordedBy || '';
  } catch {}
}

// ─── BLE connect ──────────────────────────────────────────────────────────────

const DEVICE_CONFIG = {
  temp: {
    label: 'Thermometer',
    serviceUUID: GATT.HEALTH_THERMOMETER_SERVICE,
    charUUID:    GATT.TEMPERATURE_MEASUREMENT,
    eventType:   'indicate',
    parser:      parseTemperature,
    onReading:   (r) => r && addReadings([r], 'temp'),
  },
  bp: {
    label: 'BP Monitor',
    serviceUUID: GATT.BLOOD_PRESSURE_SERVICE,
    charUUID:    GATT.BLOOD_PRESSURE_MEASUREMENT,
    eventType:   'indicate',
    parser:      parseBloodPressure,
    onReading:   (r) => r && addReadings(Array.isArray(r) ? r : [r], 'bp'),
  },
  spo2: {
    label: 'Pulse Oximeter',
    serviceUUID: GATT.PLX_SERVICE,
    charUUID:    GATT.PLX_SPOT_CHECK,
    eventType:   'indicate',
    parser:      parsePlxSpotCheck,
    onReading:   (r) => r && addReadings(Array.isArray(r) ? r : [r], 'spo2'),
  },
};

async function connectDevice(type) {
  if (!navigator.bluetooth) return;
  const dc = DEVICE_CONFIG[type];
  setDot(type, 'connecting');
  setDisplay(type, 'Scanning…');

  try {
    // acceptAllDevices (rather than filtering by service) because many cheap
    // OEM devices don't advertise their GATT service UUID in the scan
    // response, only after connecting — filtering would hide them entirely.
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ALL_KNOWN_SERVICES,
    });
    connectedDevices[type] = device;

    device.addEventListener('gattserverdisconnected', () => {
      setDot(type, 'error');
      setDisplay(type, 'Disconnected');
    });

    const server  = await device.gatt.connect();
    let service, char;
    try {
      service = await server.getPrimaryService(dc.serviceUUID);
      char    = await service.getCharacteristic(dc.charUUID);
    } catch (e) {
      throw new Error(
        `Connected to "${device.name || 'device'}" but it doesn't expose the standard ` +
        `profile for ${dc.label}. Use the diagnostic scan below to find its real protocol.`
      );
    }

    setDot(type, 'connected');
    setDisplay(type, 'Connected — take a reading');

    char.addEventListener('characteristicvaluechanged', (e) => {
      const result = dc.parser(e.target.value);
      if (result) {
        dc.onReading(result);
        setDot(type, 'captured');
      }
    });

    await char.startNotifications();

  } catch (err) {
    setDot(type, 'error');
    setDisplay(type, err.name === 'NotFoundError' ? 'No device selected' : `Error: ${err.message}`);
    console.error(err);
  }
}

// ─── Diagnostic: connect to any device and log raw bytes ─────────────────────
// Used to capture the real protocol from a device that doesn't match any
// known profile, so it can be added to VENDOR_PROFILES afterward.

let diagLines = [];

function diagLog(line) {
  const ts = new Date().toLocaleTimeString();
  diagLines.push(`[${ts}] ${line}`);
  const el = document.getElementById('diag-log');
  el.textContent = diagLines.join('\n');
  el.scrollTop = el.scrollHeight;
}

function bytesToHex(dataView) {
  const bytes = [];
  for (let i = 0; i < dataView.byteLength; i++) {
    bytes.push(dataView.getUint8(i).toString(16).padStart(2, '0'));
  }
  return bytes.join(' ');
}

async function diagScan() {
  const statusEl = document.getElementById('diag-status');
  statusEl.textContent = 'Opening device picker…';

  try {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ALL_KNOWN_SERVICES,
    });

    diagLog(`Connecting to "${device.name || '(unnamed device)'}" (id: ${device.id})`);
    statusEl.textContent = `Connecting to ${device.name || 'device'}…`;

    device.addEventListener('gattserverdisconnected', () => {
      diagLog('Device disconnected.');
      statusEl.textContent = 'Disconnected.';
    });

    const server = await device.gatt.connect();
    diagLog('Connected. Discovering services…');

    const services = await server.getPrimaryServices();
    diagLog(`Found ${services.length} service(s).`);

    let subscribedCount = 0;

    for (const service of services) {
      diagLog(`Service: ${service.uuid}`);
      let characteristics;
      try {
        characteristics = await service.getCharacteristics();
      } catch (e) {
        diagLog(`  (could not read characteristics: ${e.message})`);
        continue;
      }

      for (const char of characteristics) {
        const props = Object.entries(char.properties)
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join(', ');
        diagLog(`  Characteristic: ${char.uuid}  [${props}]`);

        if (char.properties.notify || char.properties.indicate) {
          try {
            char.addEventListener('characteristicvaluechanged', (e) => {
              diagLog(`  DATA from ${char.uuid}: ${bytesToHex(e.target.value)}`);
            });
            await char.startNotifications();
            subscribedCount++;
            diagLog(`  → subscribed to notifications on ${char.uuid}`);
          } catch (e) {
            diagLog(`  → failed to subscribe: ${e.message}`);
          }
        }
      }
    }

    statusEl.textContent = subscribedCount > 0
      ? `Connected and listening on ${subscribedCount} channel(s). Now take a reading on the device.`
      : 'Connected, but found no notify/indicate channels to listen on.';

  } catch (err) {
    statusEl.textContent = err.name === 'NotFoundError' ? 'No device selected.' : `Error: ${err.message}`;
    diagLog(`ERROR: ${err.message}`);
  }
}

function diagClear() {
  diagLines = [];
  document.getElementById('diag-log').textContent = '';
  document.getElementById('diag-status').textContent = '';
}

function diagCopy() {
  const text = diagLines.join('\n');
  navigator.clipboard.writeText(text).then(() => {
    document.getElementById('diag-status').textContent = 'Log copied to clipboard.';
  }).catch(() => {
    document.getElementById('diag-status').textContent = 'Could not copy automatically — select and copy the log text manually.';
  });
}

// ─── Manual entry ─────────────────────────────────────────────────────────────

function openManual(type) {
  const el = document.getElementById(`manual-${type}`);
  el.classList.toggle('open');
}

function saveManual(type, vitalType) {
  const val  = parseFloat(document.getElementById(`manual-val-${type}`).value);
  const unit = document.getElementById(`manual-unit-${type}`).value;
  if (isNaN(val)) return;
  addReadings([{ vitalType, value: val, unit, source: 'manual' }], type);
  document.getElementById(`manual-${type}`).classList.remove('open');
}

function saveManualBP() {
  const sys   = parseFloat(document.getElementById('manual-sys').value);
  const dia   = parseFloat(document.getElementById('manual-dia').value);
  const pulse = parseFloat(document.getElementById('manual-pulse').value);
  const readings = [];
  if (!isNaN(sys))   readings.push({ vitalType: 'blood_pressure_systolic',  value: sys,   unit: 'mmHg', source: 'manual' });
  if (!isNaN(dia))   readings.push({ vitalType: 'blood_pressure_diastolic', value: dia,   unit: 'mmHg', source: 'manual' });
  if (!isNaN(pulse)) readings.push({ vitalType: 'pulse_rate',               value: pulse, unit: '/min', source: 'manual' });
  if (readings.length) addReadings(readings, 'bp');
  document.getElementById('manual-bp').classList.remove('open');
}

function saveManualSpo2() {
  const spo2  = parseFloat(document.getElementById('manual-val-spo2').value);
  const pulse = parseFloat(document.getElementById('manual-pulse-spo2').value);
  const readings = [];
  if (!isNaN(spo2))  readings.push({ vitalType: 'spo2',       value: spo2,  unit: '%',    source: 'manual' });
  if (!isNaN(pulse)) readings.push({ vitalType: 'pulse_rate', value: pulse, unit: '/min', source: 'manual' });
  if (readings.length) addReadings(readings, 'spo2');
  document.getElementById('manual-spo2').classList.remove('open');
}

// ─── Reading management ───────────────────────────────────────────────────────

const DISPLAY_LABELS = {
  body_temperature:        (r) => `${r.value.toFixed(1)} ${r.unit === 'Cel' ? '°C' : '°F'}`,
  blood_pressure_systolic: (r) => null, // combined in BP display
  blood_pressure_diastolic:(r) => null,
  spo2:                    (r) => `${r.value.toFixed(0)}%`,
  pulse_rate:              (r) => `${r.value.toFixed(0)} bpm`,
};

function addReadings(readings, panelType) {
  const ts = new Date().toISOString();
  for (const r of readings) {
    // Replace any previous reading of same vitalType
    const idx = pendingReadings.findIndex(x => x.vitalType === r.vitalType);
    const entry = { ...r, patientId: cfg.patientId, recordedBy: cfg.recordedBy, timestamp: ts };
    if (idx >= 0) pendingReadings[idx] = entry;
    else pendingReadings.push(entry);
  }

  // Update display for panel
  if (panelType === 'temp') {
    const t = pendingReadings.find(r => r.vitalType === 'body_temperature');
    if (t) setDisplay('temp', DISPLAY_LABELS.body_temperature(t));
  }
  if (panelType === 'bp') {
    const sys = pendingReadings.find(r => r.vitalType === 'blood_pressure_systolic');
    const dia = pendingReadings.find(r => r.vitalType === 'blood_pressure_diastolic');
    const pul = pendingReadings.find(r => r.vitalType === 'pulse_rate');
    if (sys && dia) {
      setDisplay('bp', `${sys.value.toFixed(0)}/${dia.value.toFixed(0)} mmHg${pul ? `  ·  ${pul.value.toFixed(0)} bpm` : ''}`);
    }
  }
  if (panelType === 'spo2') {
    const s = pendingReadings.find(r => r.vitalType === 'spo2');
    const p = pendingReadings.find(r => r.vitalType === 'pulse_rate');
    if (s) setDisplay('spo2', `${s.value.toFixed(0)}%${p ? `  ·  ${p.value.toFixed(0)} bpm` : ''}`);
  }

  updateSendButton();
}

function updateSendButton() {
  const count = pendingReadings.length;
  const btn = document.getElementById('btn-send');
  btn.disabled = count === 0;
  btn.textContent = `Send to EMR (${count} reading${count !== 1 ? 's' : ''})`;

  const types = [...new Set(pendingReadings.map(r => {
    if (r.vitalType === 'body_temperature') return 'Temperature';
    if (r.vitalType.startsWith('blood_pressure')) return 'BP';
    if (r.vitalType === 'spo2') return 'SpO2';
    if (r.vitalType === 'pulse_rate') return 'Pulse';
    return r.vitalType;
  }))];
  document.getElementById('readings-summary').textContent =
    count ? `Ready to send: ${types.join(', ')}` : '';
}

// ─── Send to cloud-api ────────────────────────────────────────────────────────

async function sendReadings() {
  const resultEl = document.getElementById('send-result');
  resultEl.className = '';
  resultEl.textContent = 'Sending…';

  try {
    const res = await fetch(`${cfg.apiBase}/vitals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': cfg.apiKey },
      body: JSON.stringify({ readings: pendingReadings }),
    });
    const body = await res.json();

    if (!res.ok) throw new Error(body.error || res.statusText);

    const sent    = body.results.filter(r => r.syncStatus === 'sent').length;
    const failed  = body.results.filter(r => r.syncStatus === 'failed').length;
    const rejected = body.results.filter(r => !r.accepted).length;

    resultEl.className = 'success';
    resultEl.textContent =
      `✅ ${sent} reading${sent !== 1 ? 's' : ''} sent to EMR` +
      (failed   ? ` · ${failed} queued (EMR offline)` : '') +
      (rejected ? ` · ${rejected} rejected (out of range)` : '');

    // Clear sent readings and dots
    pendingReadings.length = 0;
    ['temp','bp','spo2'].forEach(t => { setDisplay(t, '—'); setDot(t, ''); });
    updateSendButton();
  } catch (err) {
    resultEl.className = 'error';
    resultEl.textContent = `❌ ${err.message}`;
  }
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function setDot(type, state) {
  const el = document.getElementById(`dot-${type}`);
  el.className = `status-dot ${state}`;
}

function setDisplay(type, text) {
  document.getElementById(`display-${type}`).textContent = text;
}
