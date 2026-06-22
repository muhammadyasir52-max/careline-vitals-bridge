const express = require('express');
const path = require('path');
const { randomUUID } = require('crypto');

// In-memory FHIR resource store, keyed by resourceType -> id -> resource.
const resources = {
  Patient: new Map(),
  Observation: new Map(),
};

// Seed a couple of demo patients so the chart viewer has something to show
// even before the first reading arrives.
resources.Patient.set('patient-demo-1', {
  resourceType: 'Patient',
  id: 'patient-demo-1',
  name: [{ text: 'Ayesha Khan' }],
  gender: 'female',
  birthDate: '1988-04-12',
});
resources.Patient.set('patient-demo-2', {
  resourceType: 'Patient',
  id: 'patient-demo-2',
  name: [{ text: 'Bilal Ahmed' }],
  gender: 'male',
  birthDate: '1975-11-02',
});

function bundle(entries) {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: entries.length,
    entry: entries.map((resource) => ({ resource })),
  };
}

function createApp() {
  const app = express();
  app.use(express.json({ type: ['application/json', 'application/fhir+json'] }));

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/health', (req, res) => res.json({ status: 'ok', emr: 'CareLine EMR Simulator' }));

  // --- FHIR R4 endpoints, matching OpenMRS/Bahmni's /ws/fhir2/R4 surface ---

  app.get('/ws/fhir2/R4/Patient/:id', (req, res) => {
    const patient = resources.Patient.get(req.params.id);
    if (!patient) return res.status(404).json({ resourceType: 'OperationOutcome', issue: [{ diagnostics: 'Patient not found' }] });
    res.json(patient);
  });

  app.get('/ws/fhir2/R4/Patient', (req, res) => {
    res.json(bundle(Array.from(resources.Patient.values())));
  });

  // POST /ws/fhir2/R4/Observation - the endpoint our FHIR adapter calls.
  app.post('/ws/fhir2/R4/Observation', (req, res) => {
    const observation = req.body;
    if (observation.resourceType !== 'Observation') {
      return res.status(400).json({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', diagnostics: 'resourceType must be Observation' }],
      });
    }
    const id = randomUUID();
    const stored = { ...observation, id, meta: { lastUpdated: new Date().toISOString() } };
    resources.Observation.set(id, stored);
    res.status(201).location(`/ws/fhir2/R4/Observation/${id}`).json(stored);
  });

  app.get('/ws/fhir2/R4/Observation/:id', (req, res) => {
    const obs = resources.Observation.get(req.params.id);
    if (!obs) return res.status(404).json({ resourceType: 'OperationOutcome', issue: [{ diagnostics: 'Observation not found' }] });
    res.json(obs);
  });

  // GET /ws/fhir2/R4/Observation?subject=Patient/{id}&category=vital-signs
  app.get('/ws/fhir2/R4/Observation', (req, res) => {
    let entries = Array.from(resources.Observation.values());
    if (req.query.subject) {
      entries = entries.filter((o) => o.subject && o.subject.reference === req.query.subject);
    }
    entries.sort((a, b) => new Date(b.effectiveDateTime) - new Date(a.effectiveDateTime));
    res.json(bundle(entries));
  });

  // --- Admin/demo helper endpoints (not part of the FHIR spec) ---

  app.get('/api/patients', (req, res) => {
    res.json(Array.from(resources.Patient.values()));
  });

  app.post('/api/reset', (req, res) => {
    resources.Observation.clear();
    res.json({ status: 'reset' });
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  const port = process.env.PORT || process.env.EMR_SIM_PORT || 6010;
  app.listen(port, () => {
    console.log(`CareLine EMR Simulator (FHIR R4) listening on port ${port}`);
    console.log(`  FHIR base URL: http://localhost:${port}/ws/fhir2/R4`);
    console.log(`  Chart viewer:  http://localhost:${port}/`);
  });
}

module.exports = { createApp };
