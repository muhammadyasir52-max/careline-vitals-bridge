const { normalizeReading } = require('../src/normalize/normalize');

const baseTenant = { unitPreferences: {} };

describe('normalizeReading', () => {
  test('body temperature -> FHIR Observation with LOINC 8310-5', () => {
    const reading = {
      patientId: 'patient-1',
      deviceId: 'thermo-001',
      recordedBy: 'nurse-1',
      vitalType: 'body_temperature',
      value: 37.2,
      unit: 'Cel',
      timestamp: '2026-06-13T10:00:00Z',
    };
    const result = normalizeReading(reading, baseTenant, { idempotencyKey: 'idem-1' });

    expect(result.valid).toBe(true);
    expect(result.normalizedValue).toBeCloseTo(37.2);
    expect(result.unit).toBe('Cel');
    expect(result.observation.resourceType).toBe('Observation');
    expect(result.observation.code.coding[0].code).toBe('8310-5');
    expect(result.observation.subject.reference).toBe('Patient/patient-1');
    expect(result.observation.valueQuantity).toEqual({
      value: 37.2,
      unit: 'Cel',
      system: 'http://unitsofmeasure.org',
      code: 'Cel',
    });
    expect(result.observation.identifier[0].value).toBe('idem-1');
  });

  test('body temperature in Fahrenheit is converted to Celsius', () => {
    const reading = {
      patientId: 'patient-1',
      vitalType: 'body_temperature',
      value: 98.6,
      unit: 'degF',
    };
    const result = normalizeReading(reading, baseTenant);
    expect(result.valid).toBe(true);
    expect(result.unit).toBe('Cel');
    expect(result.normalizedValue).toBeCloseTo(37, 1);
  });

  test('blood pressure systolic -> LOINC 8480-6', () => {
    const reading = {
      patientId: 'patient-2',
      vitalType: 'blood_pressure_systolic',
      value: 120,
      unit: 'mmHg',
    };
    const result = normalizeReading(reading, baseTenant);
    expect(result.valid).toBe(true);
    expect(result.observation.code.coding[0].code).toBe('8480-6');
    expect(result.observation.valueQuantity.value).toBe(120);
  });

  test('blood pressure diastolic -> LOINC 8462-4', () => {
    const reading = {
      patientId: 'patient-2',
      vitalType: 'blood_pressure_diastolic',
      value: 80,
      unit: 'mmHg',
    };
    const result = normalizeReading(reading, baseTenant);
    expect(result.valid).toBe(true);
    expect(result.observation.code.coding[0].code).toBe('8462-4');
  });

  test('SpO2 -> LOINC 59408-5', () => {
    const reading = {
      patientId: 'patient-3',
      vitalType: 'spo2',
      value: 98,
      unit: '%',
    };
    const result = normalizeReading(reading, baseTenant);
    expect(result.valid).toBe(true);
    expect(result.observation.code.coding[0].code).toBe('59408-5');
  });

  test('pulse rate -> LOINC 8867-4', () => {
    const reading = {
      patientId: 'patient-3',
      vitalType: 'pulse_rate',
      value: 72,
      unit: '/min',
    };
    const result = normalizeReading(reading, baseTenant);
    expect(result.valid).toBe(true);
    expect(result.observation.code.coding[0].code).toBe('8867-4');
  });

  test('rejects out-of-range values', () => {
    const reading = {
      patientId: 'patient-1',
      vitalType: 'spo2',
      value: 150,
      unit: '%',
    };
    const result = normalizeReading(reading, baseTenant);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/out of range/);
  });

  test('rejects unknown vital type', () => {
    const reading = {
      patientId: 'patient-1',
      vitalType: 'respiratory_rate',
      value: 16,
      unit: '/min',
    };
    const result = normalizeReading(reading, baseTenant);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/Unknown vital type/);
  });

  test('rejects non-numeric value', () => {
    const reading = {
      patientId: 'patient-1',
      vitalType: 'spo2',
      value: 'high',
      unit: '%',
    };
    const result = normalizeReading(reading, baseTenant);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/must be a number/);
  });

  test('honors per-tenant range overrides', () => {
    const tenant = { unitPreferences: { spo2: { min: 90, max: 100 } } };
    const reading = { patientId: 'p1', vitalType: 'spo2', value: 85, unit: '%' };
    const result = normalizeReading(reading, tenant);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/out of range \[90, 100\]/);
  });
});
