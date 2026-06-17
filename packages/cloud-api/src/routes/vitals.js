const express = require('express');
const { randomUUID } = require('crypto');
const { tenantAuth } = require('../middleware/auth');
const { normalizeReading } = require('../normalize/normalize');
const { enqueueDelivery } = require('../queue/retryQueue');
const store = require('../models/store');

const router = express.Router();

// POST /api/v1/vitals
// Body: { readings: [ { patientId, deviceId, recordedBy, vitalType, value, unit, timestamp, idempotencyKey? }, ... ] }
router.post('/', tenantAuth, async (req, res) => {
  const { readings: incoming } = req.body;
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return res.status(400).json({ error: 'Body must include a non-empty "readings" array' });
  }

  const results = [];

  for (const rawReading of incoming) {
    const idempotencyKey = rawReading.idempotencyKey || randomUUID();
    const normalized = normalizeReading(rawReading, req.tenant, { idempotencyKey });

    if (!normalized.valid) {
      store.appendAudit(req.tenant.tenantId, {
        action: 'reading_rejected',
        rawReading,
        reason: normalized.reason,
        idempotencyKey,
      });
      results.push({ idempotencyKey, accepted: false, reason: normalized.reason });
      continue;
    }

    const stored = store.saveReading(req.tenant.tenantId, {
      ...rawReading,
      idempotencyKey,
      normalizedValue: normalized.normalizedValue,
      unit: normalized.unit,
      observation: normalized.observation,
      syncStatus: 'pending',
      receivedAt: new Date().toISOString(),
    });

    store.appendAudit(req.tenant.tenantId, {
      action: 'reading_received',
      readingId: stored.readingId,
      vitalType: rawReading.vitalType,
      patientId: rawReading.patientId,
      idempotencyKey,
    });

    // Deliver to EMR. We await here to keep the API response truthful about
    // sync status; failed deliveries are retried internally and end up
    // dead-lettered, not lost.
    const delivery = await enqueueDelivery(req.tenant, normalized.observation, rawReading, {
      readingId: stored.readingId,
      idempotencyKey,
      normalizedValue: normalized.normalizedValue,
      unit: normalized.unit,
      maxAttempts: req.tenant.emrAdapter.maxAttempts,
      baseDelayMs: req.tenant.emrAdapter.baseDelayMs,
      sleep: req.app.get('sleepOverride'),
    });

    stored.syncStatus = delivery.delivered ? 'sent' : 'failed';

    results.push({
      idempotencyKey,
      readingId: stored.readingId,
      accepted: true,
      syncStatus: stored.syncStatus,
      attempts: delivery.attempts,
    });
  }

  res.status(202).json({ results });
});

module.exports = router;
