// Simple in-memory, tenant-isolated data store.
// Swappable for Postgres/Mongo later behind the same function interface.

const { randomUUID } = require('crypto');

const tenants = new Map(); // tenantId -> tenant config
const readings = new Map(); // tenantId -> array of readings
const auditLog = new Map(); // tenantId -> array of audit entries
const deadLetters = new Map(); // tenantId -> array of dead-lettered deliveries

function createTenant(tenant) {
  const tenantId = tenant.tenantId || randomUUID();
  const record = {
    tenantId,
    name: tenant.name,
    apiKey: tenant.apiKey || randomUUID(),
    emrAdapter: tenant.emrAdapter, // { type: 'fhir'|'hl7v2'|'custom-rest', config: {...} }
    unitPreferences: tenant.unitPreferences || {},
    createdAt: new Date().toISOString(),
  };
  tenants.set(tenantId, record);
  readings.set(tenantId, []);
  auditLog.set(tenantId, []);
  deadLetters.set(tenantId, []);
  return record;
}

function getTenant(tenantId) {
  return tenants.get(tenantId);
}

function getTenantByApiKey(apiKey) {
  for (const tenant of tenants.values()) {
    if (tenant.apiKey === apiKey) return tenant;
  }
  return undefined;
}

function listTenants() {
  return Array.from(tenants.values());
}

function saveReading(tenantId, reading) {
  const record = { readingId: randomUUID(), tenantId, ...reading };
  readings.get(tenantId).push(record);
  return record;
}

function listReadings(tenantId) {
  return readings.get(tenantId) || [];
}

function appendAudit(tenantId, entry) {
  const record = {
    auditId: randomUUID(),
    tenantId,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  auditLog.get(tenantId).push(record);
  return record;
}

function listAudit(tenantId) {
  return auditLog.get(tenantId) || [];
}

function addDeadLetter(tenantId, entry) {
  const record = { deadLetterId: randomUUID(), tenantId, ...entry };
  deadLetters.get(tenantId).push(record);
  return record;
}

function listDeadLetters(tenantId) {
  return deadLetters.get(tenantId) || [];
}

function reset() {
  tenants.clear();
  readings.clear();
  auditLog.clear();
  deadLetters.clear();
}

module.exports = {
  createTenant,
  getTenant,
  getTenantByApiKey,
  listTenants,
  saveReading,
  listReadings,
  appendAudit,
  listAudit,
  addDeadLetter,
  listDeadLetters,
  reset,
};
