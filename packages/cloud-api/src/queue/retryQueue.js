const { sendToEmr } = require('../adapters');
const store = require('../models/store');

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 100;

function backoffDelay(attempt, baseDelayMs) {
  return baseDelayMs * Math.pow(2, attempt - 1);
}

// Attempts delivery to the EMR, retrying with exponential backoff on
// failure. On final failure the delivery is recorded in the tenant's
// dead-letter queue. Returns a promise that resolves once the delivery
// has either succeeded or been dead-lettered (never rejects).
async function enqueueDelivery(tenant, observation, rawReading, opts = {}) {
  const maxAttempts = opts.maxAttempts || DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = opts.baseDelayMs || DEFAULT_BASE_DELAY_MS;
  const sleep = opts.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await sendToEmr(tenant, observation, rawReading, opts);
      store.appendAudit(tenant.tenantId, {
        action: 'emr_delivery_succeeded',
        readingId: opts.readingId,
        attempt,
        idempotencyKey: opts.idempotencyKey,
      });
      return { delivered: true, attempts: attempt, result };
    } catch (err) {
      lastError = err;
      store.appendAudit(tenant.tenantId, {
        action: 'emr_delivery_failed',
        readingId: opts.readingId,
        attempt,
        error: err.message,
        idempotencyKey: opts.idempotencyKey,
      });
      if (attempt < maxAttempts) {
        await sleep(backoffDelay(attempt, baseDelayMs));
      }
    }
  }

  const deadLetter = store.addDeadLetter(tenant.tenantId, {
    readingId: opts.readingId,
    observation,
    rawReading,
    idempotencyKey: opts.idempotencyKey,
    error: lastError ? lastError.message : 'unknown error',
    attempts: maxAttempts,
    timestamp: new Date().toISOString(),
  });
  store.appendAudit(tenant.tenantId, {
    action: 'emr_delivery_dead_lettered',
    readingId: opts.readingId,
    deadLetterId: deadLetter.deadLetterId,
    idempotencyKey: opts.idempotencyKey,
  });
  return { delivered: false, attempts: maxAttempts, error: lastError, deadLetter };
}

// Re-attempt a dead-lettered delivery (e.g. after the EMR comes back online).
async function redeliverDeadLetter(tenant, deadLetter, opts = {}) {
  return enqueueDelivery(tenant, deadLetter.observation, deadLetter.rawReading, {
    ...opts,
    readingId: deadLetter.readingId,
    idempotencyKey: deadLetter.idempotencyKey,
  });
}

module.exports = { enqueueDelivery, redeliverDeadLetter, backoffDelay };
