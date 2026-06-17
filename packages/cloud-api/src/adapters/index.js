const fhirAdapter = require('./fhirAdapter');
const hl7v2Adapter = require('./hl7v2Adapter');
const customRestAdapter = require('./customRestAdapter');

const ADAPTERS = {
  fhir: fhirAdapter,
  hl7v2: hl7v2Adapter,
  'custom-rest': customRestAdapter,
};

// Dispatch an Observation to the EMR configured for this tenant.
// tenant.emrAdapter = { type: 'fhir'|'hl7v2'|'custom-rest', config: {...} }
function getAdapter(adapterType) {
  const adapter = ADAPTERS[adapterType];
  if (!adapter) {
    throw new Error(`Unknown EMR adapter type: ${adapterType}`);
  }
  return adapter;
}

function sendToEmr(tenant, observation, rawReading, opts = {}) {
  const { type, config } = tenant.emrAdapter;
  const adapter = getAdapter(type);
  return adapter.send(observation, rawReading, config, opts);
}

module.exports = { ADAPTERS, getAdapter, sendToEmr };
