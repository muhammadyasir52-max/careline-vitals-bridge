// Custom REST adapter for bespoke hospital EMRs.
// Tenant config shape:
//   { type: 'custom-rest', config: { url, authHeader?, fieldMap? } }
//
// `fieldMap` (optional) maps our canonical reading fields to the
// customer's expected JSON keys, e.g. { patientId: 'mrn', value: 'reading' }.

function applyFieldMap(payload, fieldMap) {
  if (!fieldMap) return payload;
  const mapped = {};
  for (const [ourKey, theirKey] of Object.entries(fieldMap)) {
    if (payload[ourKey] !== undefined) {
      mapped[theirKey] = payload[ourKey];
    }
  }
  // Preserve any fields not explicitly remapped.
  for (const [key, value] of Object.entries(payload)) {
    if (!(key in fieldMap) && !(key in mapped)) {
      mapped[key] = value;
    }
  }
  return mapped;
}

async function send(observation, rawReading, config, opts = {}) {
  const payload = applyFieldMap(
    {
      patientId: rawReading.patientId,
      vitalType: rawReading.vitalType,
      value: opts.normalizedValue,
      unit: opts.unit,
      timestamp: rawReading.timestamp,
      observation,
    },
    config.fieldMap
  );

  const headers = { 'Content-Type': 'application/json' };
  if (config.authHeader) {
    headers.Authorization = config.authHeader;
  }

  const response = await fetch(config.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Custom REST adapter: EMR responded ${response.status} ${body}`);
  }

  const body = await response.json().catch(() => ({}));
  return { delivered: true, emrResponse: body };
}

module.exports = { send, applyFieldMap };
