const request = require('supertest');
const { createApp } = require('../src/server');
const store = require('../src/models/store');
const mockFhirServer = require('./mocks/mockFhirServer');
const mockHl7Listener = require('./mocks/mockHl7Listener');

describe('Vitals ingestion API', () => {
  let app;
  let fhirServer;
  let hl7Listener;
  let fhirTenant;
  let hl7Tenant;

  beforeAll(async () => {
    fhirServer = await mockFhirServer.start();
    hl7Listener = await mockHl7Listener.start();
  });

  afterAll(async () => {
    await fhirServer.stop();
    await hl7Listener.stop();
  });

  beforeEach(async () => {
    store.reset();
    app = createApp();
    // make retries fast in tests
    app.set('sleepOverride', () => Promise.resolve());

    const fhirRes = await request(app)
      .post('/api/v1/tenants')
      .send({
        name: 'Riverside Hospital (FHIR)',
        emrAdapter: { type: 'fhir', config: { baseUrl: fhirServer.baseUrl } },
      });
    fhirTenant = fhirRes.body;

    const hl7Res = await request(app)
      .post('/api/v1/tenants')
      .send({
        name: 'Lakeside Clinic (HL7v2)',
        emrAdapter: {
          type: 'hl7v2',
          config: { host: hl7Listener.host, port: hl7Listener.port },
        },
      });
    hl7Tenant = hl7Res.body;
  });

  test('rejects requests without an API key', async () => {
    const res = await request(app)
      .post('/api/v1/vitals')
      .send({ readings: [{ patientId: 'p1', vitalType: 'spo2', value: 98, unit: '%' }] });
    expect(res.status).toBe(401);
  });

  test('ingests a valid reading and delivers it to the FHIR EMR', async () => {
    const res = await request(app)
      .post('/api/v1/vitals')
      .set('X-Api-Key', fhirTenant.apiKey)
      .send({
        readings: [
          {
            patientId: 'patient-1',
            deviceId: 'thermo-1',
            recordedBy: 'careManager-1',
            vitalType: 'body_temperature',
            value: 37.1,
            unit: 'Cel',
            timestamp: '2026-06-13T09:00:00Z',
          },
        ],
      });

    expect(res.status).toBe(202);
    expect(res.body.results[0].accepted).toBe(true);
    expect(res.body.results[0].syncStatus).toBe('sent');
    expect(fhirServer.getReceived().length).toBeGreaterThan(0);
  });

  test('ingests a valid reading and delivers it to the HL7v2 EMR via MLLP', async () => {
    const res = await request(app)
      .post('/api/v1/vitals')
      .set('X-Api-Key', hl7Tenant.apiKey)
      .send({
        readings: [
          {
            patientId: 'patient-2',
            deviceId: 'oximeter-1',
            recordedBy: 'careManager-2',
            vitalType: 'spo2',
            value: 96,
            unit: '%',
            timestamp: '2026-06-13T09:05:00Z',
          },
        ],
      });

    expect(res.status).toBe(202);
    expect(res.body.results[0].syncStatus).toBe('sent');
    expect(hl7Listener.getReceived().some((m) => m.includes('59408-5'))).toBe(true);
  });

  test('rejects out-of-range readings before they reach the EMR', async () => {
    const res = await request(app)
      .post('/api/v1/vitals')
      .set('X-Api-Key', fhirTenant.apiKey)
      .send({
        readings: [{ patientId: 'patient-3', vitalType: 'spo2', value: 250, unit: '%' }],
      });

    expect(res.status).toBe(202);
    expect(res.body.results[0].accepted).toBe(false);
    expect(res.body.results[0].reason).toMatch(/out of range/);
  });

  test('tenant isolation: readings for one tenant are not visible to another', async () => {
    await request(app)
      .post('/api/v1/vitals')
      .set('X-Api-Key', fhirTenant.apiKey)
      .send({
        readings: [{ patientId: 'patient-a', vitalType: 'pulse_rate', value: 70, unit: '/min' }],
      });

    await request(app)
      .post('/api/v1/vitals')
      .set('X-Api-Key', hl7Tenant.apiKey)
      .send({
        readings: [{ patientId: 'patient-b', vitalType: 'pulse_rate', value: 80, unit: '/min' }],
      });

    const fhirReadings = await request(app).get(`/api/v1/tenants/${fhirTenant.tenantId}/readings`);
    const hl7Readings = await request(app).get(`/api/v1/tenants/${hl7Tenant.tenantId}/readings`);

    expect(fhirReadings.body).toHaveLength(1);
    expect(fhirReadings.body[0].patientId).toBe('patient-a');
    expect(hl7Readings.body).toHaveLength(1);
    expect(hl7Readings.body[0].patientId).toBe('patient-b');
  });

  test('failure mode: EMR offline -> retries then dead-letters, then recovers on redelivery', async () => {
    fhirServer.setFailMode(true);

    const res = await request(app)
      .post('/api/v1/vitals')
      .set('X-Api-Key', fhirTenant.apiKey)
      .send({
        readings: [
          { patientId: 'patient-4', vitalType: 'pulse_rate', value: 75, unit: '/min', idempotencyKey: 'idem-fail-1' },
        ],
      });

    expect(res.body.results[0].syncStatus).toBe('failed');
    expect(res.body.results[0].attempts).toBeGreaterThan(1);

    const deadLetters = await request(app).get(`/api/v1/tenants/${fhirTenant.tenantId}/dead-letters`);
    expect(deadLetters.body).toHaveLength(1);
    expect(deadLetters.body[0].idempotencyKey).toBe('idem-fail-1');

    // EMR comes back online
    fhirServer.setFailMode(false);

    const { redeliverDeadLetter } = require('../src/queue/retryQueue');
    const tenant = store.getTenant(fhirTenant.tenantId);
    const redelivery = await redeliverDeadLetter(tenant, deadLetters.body[0], {
      sleep: () => Promise.resolve(),
    });
    expect(redelivery.delivered).toBe(true);

    const dashboard = await request(app).get(`/api/v1/tenants/${fhirTenant.tenantId}/dashboard`);
    expect(dashboard.body.deadLetterCount).toBe(1); // original dead letter remains as historical record
  });

  test('dashboard reflects per-tenant sync stats', async () => {
    await request(app)
      .post('/api/v1/vitals')
      .set('X-Api-Key', fhirTenant.apiKey)
      .send({
        readings: [{ patientId: 'patient-5', vitalType: 'spo2', value: 99, unit: '%' }],
      });

    const dashboard = await request(app).get(`/api/v1/tenants/${fhirTenant.tenantId}/dashboard`);
    expect(dashboard.body.totalReadings).toBe(1);
    expect(dashboard.body.sentCount).toBe(1);
    expect(dashboard.body.syncSuccessRate).toBe(1);
  });
});
