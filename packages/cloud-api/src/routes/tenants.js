const express = require('express');
const store = require('../models/store');
const { getAdapter } = require('../adapters');

const router = express.Router();

// POST /api/v1/tenants - onboard a new hospital/clinic tenant
// Body: { name, emrAdapter: { type, config }, unitPreferences? }
router.post('/', (req, res) => {
  const { name, emrAdapter, unitPreferences } = req.body;
  if (!name || !emrAdapter || !emrAdapter.type) {
    return res.status(400).json({ error: 'name and emrAdapter.type are required' });
  }
  try {
    getAdapter(emrAdapter.type);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const tenant = store.createTenant({ name, emrAdapter, unitPreferences });
  res.status(201).json(tenant);
});

// GET /api/v1/tenants - list tenants (admin)
router.get('/', (req, res) => {
  res.json(store.listTenants());
});

// GET /api/v1/tenants/:tenantId/dashboard - data flow health for a tenant
router.get('/:tenantId/dashboard', (req, res) => {
  const tenant = store.getTenant(req.params.tenantId);
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }

  const readings = store.listReadings(req.params.tenantId);
  const deadLetters = store.listDeadLetters(req.params.tenantId);
  const audit = store.listAudit(req.params.tenantId);

  const lastReading = readings[readings.length - 1];
  const sentCount = readings.filter((r) => r.syncStatus === 'sent').length;
  const failedCount = readings.filter((r) => r.syncStatus === 'failed').length;

  res.json({
    tenant: { tenantId: tenant.tenantId, name: tenant.name, emrAdapter: { type: tenant.emrAdapter.type } },
    totalReadings: readings.length,
    sentCount,
    failedCount,
    deadLetterCount: deadLetters.length,
    lastReadingAt: lastReading ? lastReading.receivedAt : null,
    syncSuccessRate: readings.length ? sentCount / readings.length : null,
    recentAudit: audit.slice(-20),
  });
});

// GET /api/v1/tenants/:tenantId/dead-letters
router.get('/:tenantId/dead-letters', (req, res) => {
  const tenant = store.getTenant(req.params.tenantId);
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }
  res.json(store.listDeadLetters(req.params.tenantId));
});

// GET /api/v1/tenants/:tenantId/readings
router.get('/:tenantId/readings', (req, res) => {
  const tenant = store.getTenant(req.params.tenantId);
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }
  res.json(store.listReadings(req.params.tenantId));
});

module.exports = router;
