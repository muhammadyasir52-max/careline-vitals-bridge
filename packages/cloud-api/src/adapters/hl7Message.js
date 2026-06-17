const { getVitalDefinition } = require('../normalize/loinc');

const FIELD = '|';
const COMPONENT = '^';
const SEGMENT_END = '\r';

function hl7Timestamp(date = new Date()) {
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

// Build an HL7 v2.3 ORU^R01 message for a single vital sign observation.
// `rawReading` is the raw ingested reading, `normalized` is { normalizedValue, unit }.
function buildOruR01(rawReading, normalized, config, opts = {}) {
  const def = getVitalDefinition(rawReading.vitalType);
  const ts = hl7Timestamp(new Date(rawReading.timestamp || Date.now()));
  const messageControlId = opts.idempotencyKey || `${Date.now()}`;

  const sendingApp = config.sendingApplication || 'VitalsPlatform';
  const sendingFacility = config.sendingFacility || 'VitalsPlatform';
  const receivingApp = config.receivingApplication || '';
  const receivingFacility = config.receivingFacility || '';

  const segments = [
    [
      'MSH',
      '^~\\&',
      sendingApp,
      sendingFacility,
      receivingApp,
      receivingFacility,
      ts,
      '',
      'ORU' + COMPONENT + 'R01',
      messageControlId,
      'P',
      '2.3',
    ].join(FIELD),
    ['PID', '1', '', rawReading.patientId, '', '', '', ''].join(FIELD),
    ['OBR', '1', '', '', 'VITALS' + COMPONENT + 'Vital Signs Panel'].join(FIELD),
    [
      'OBX',
      '1',
      'NM',
      `${def.loincCode}${COMPONENT}${def.display}${COMPONENT}LN`,
      '',
      String(normalized.normalizedValue),
      normalized.unit,
      '',
      '',
      '',
      'F',
    ].join(FIELD),
  ];

  return segments.join(SEGMENT_END) + SEGMENT_END;
}

// Wrap an HL7 message in MLLP framing: <VT> message <FS><CR>
const VT = String.fromCharCode(0x0b);
const FS = String.fromCharCode(0x1c);
const CR = String.fromCharCode(0x0d);

function wrapMllp(message) {
  return VT + message + FS + CR;
}

module.exports = { buildOruR01, wrapMllp, hl7Timestamp, VT, FS, CR };
