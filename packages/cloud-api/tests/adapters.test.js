const fhirAdapter = require('../src/adapters/fhirAdapter');
const hl7v2Adapter = require('../src/adapters/hl7v2Adapter');
const { applyFieldMap, send: customRestSend } = require('../src/adapters/customRestAdapter');
const { buildOruR01 } = require('../src/adapters/hl7Message');
const { normalizeReading } = require('../src/normalize/normalize');
const mockFhirServer = require('./mocks/mockFhirServer');
const mockHl7Listener = require('./mocks/mockHl7Listener');
const mockFhirServerFactory = require('./mocks/mockFhirServer');

const reading = {
  patientId: 'patient-42',
  deviceId: 'oximeter-7',
  recordedBy: 'nurse-jane',
  vitalType: 'spo2',
  value: 97,
  unit: '%',
  timestamp: '2026-06-13T08:00:00Z',
};

describe('fhirAdapter', () => {
  let mockServer;

  beforeAll(async () => {
    mockServer = await mockFhirServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  test('posts Observation to /Observation and returns delivered=true', async () => {
    const normalized = normalizeReading(reading, {});
    const result = await fhirAdapter.send(normalized.observation, reading, {
      baseUrl: mockServer.baseUrl,
    });
    expect(result.delivered).toBe(true);
    expect(mockServer.getReceived()).toHaveLength(1);
    expect(mockServer.getReceived()[0].code.coding[0].code).toBe('59408-5');
  });

  test('throws when EMR responds with error status', async () => {
    mockServer.setFailMode(true);
    const normalized = normalizeReading(reading, {});
    await expect(
      fhirAdapter.send(normalized.observation, reading, { baseUrl: mockServer.baseUrl })
    ).rejects.toThrow(/responded 503/);
    mockServer.setFailMode(false);
  });
});

describe('hl7Message.buildOruR01', () => {
  test('builds an ORU^R01 message with the correct LOINC code and value', () => {
    const message = buildOruR01(
      reading,
      { normalizedValue: 97, unit: '%' },
      { sendingApplication: 'VitalsPlatform', sendingFacility: 'VitalsPlatform' },
      { idempotencyKey: 'abc-123' }
    );
    expect(message).toContain('MSH|^~\\&|VitalsPlatform|VitalsPlatform');
    expect(message).toContain('ORU^R01');
    expect(message).toContain('abc-123');
    expect(message).toContain('PID|1||patient-42');
    expect(message).toContain('59408-5');
    expect(message).toContain('OBX|1|NM|59408-5');
    expect(message).toMatch(/97\|%/);
  });
});

describe('hl7v2Adapter', () => {
  let listener;

  beforeAll(async () => {
    listener = await mockHl7Listener.start();
  });

  afterAll(async () => {
    await listener.stop();
  });

  test('sends ORU^R01 over MLLP and resolves on AA ack', async () => {
    const normalized = normalizeReading(reading, {});
    const result = await hl7v2Adapter.send(
      normalized.observation,
      reading,
      { host: listener.host, port: listener.port },
      { normalizedValue: normalized.normalizedValue, unit: normalized.unit, idempotencyKey: 'idem-9' }
    );
    expect(result.delivered).toBe(true);
    expect(listener.getReceived()[0]).toContain('idem-9');
  });

  test('rejects on negative ACK (AE)', async () => {
    listener.setFailMode(true);
    const normalized = normalizeReading(reading, {});
    await expect(
      hl7v2Adapter.send(
        normalized.observation,
        reading,
        { host: listener.host, port: listener.port },
        { normalizedValue: normalized.normalizedValue, unit: normalized.unit }
      )
    ).rejects.toThrow(/negative ACK/);
    listener.setFailMode(false);
  });
});

describe('customRestAdapter', () => {
  test('applyFieldMap remaps canonical fields to customer field names', () => {
    const mapped = applyFieldMap(
      { patientId: 'p1', value: 97, unit: '%', vitalType: 'spo2' },
      { patientId: 'mrn', value: 'reading' }
    );
    expect(mapped).toEqual({ mrn: 'p1', reading: 97, unit: '%', vitalType: 'spo2' });
  });

  test('posts mapped payload to custom REST endpoint', async () => {
    const mockServer = await mockFhirServerFactory.start();
    // Reuse the mock server's generic POST handler isn't /Observation-only,
    // so point at /Observation for simplicity.
    const normalized = normalizeReading(reading, {});
    const result = await customRestSend(normalized.observation, reading, {
      url: `${mockServer.baseUrl}/Observation`,
    });
    expect(result.delivered).toBe(true);
    await mockServer.stop();
  });
});
