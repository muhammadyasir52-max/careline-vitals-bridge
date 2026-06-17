// LOINC codes and default units for the vital signs this platform supports.
// vitalType is the canonical internal identifier used throughout the pipeline.

const VITAL_DEFINITIONS = {
  body_temperature: {
    loincCode: '8310-5',
    display: 'Body temperature',
    defaultUnit: 'Cel',
    validRange: { min: 30, max: 45 }, // degrees Celsius
  },
  blood_pressure_systolic: {
    loincCode: '8480-6',
    display: 'Systolic blood pressure',
    defaultUnit: 'mmHg',
    validRange: { min: 40, max: 300 },
  },
  blood_pressure_diastolic: {
    loincCode: '8462-4',
    display: 'Diastolic blood pressure',
    defaultUnit: 'mmHg',
    validRange: { min: 20, max: 200 },
  },
  spo2: {
    loincCode: '59408-5',
    display: 'Oxygen saturation in Arterial blood by Pulse oximetry',
    defaultUnit: '%',
    validRange: { min: 0, max: 100 },
  },
  pulse_rate: {
    loincCode: '8867-4',
    display: 'Heart rate',
    defaultUnit: '/min',
    validRange: { min: 20, max: 300 },
  },
};

// Composite "panel" definitions: a single device reading that bundles
// multiple vitalTypes (e.g. a blood pressure cuff reports systolic +
// diastolic + pulse in one go).
const PANEL_DEFINITIONS = {
  blood_pressure: ['blood_pressure_systolic', 'blood_pressure_diastolic'],
};

function getVitalDefinition(vitalType) {
  const def = VITAL_DEFINITIONS[vitalType];
  if (!def) {
    throw new Error(`Unknown vital type: ${vitalType}`);
  }
  return def;
}

module.exports = {
  VITAL_DEFINITIONS,
  PANEL_DEFINITIONS,
  getVitalDefinition,
};
