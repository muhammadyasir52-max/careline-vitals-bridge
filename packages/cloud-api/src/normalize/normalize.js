const { getVitalDefinition } = require('./loinc');
const { validateReading } = require('./validate');

// Build a FHIR R4 Observation resource for a single (validated) vital reading.
function toFhirObservation(rawReading, normalized, opts = {}) {
  const def = getVitalDefinition(rawReading.vitalType);
  const observation = {
    resourceType: 'Observation',
    status: 'final',
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'vital-signs',
            display: 'Vital Signs',
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: def.loincCode,
          display: def.display,
        },
      ],
    },
    subject: { reference: `Patient/${rawReading.patientId}` },
    effectiveDateTime: rawReading.timestamp || new Date().toISOString(),
    valueQuantity: {
      value: normalized.normalizedValue,
      unit: normalized.unit,
      system: 'http://unitsofmeasure.org',
      code: normalized.unit,
    },
  };

  if (rawReading.deviceId) {
    observation.device = { display: rawReading.deviceId };
  }
  if (rawReading.recordedBy) {
    observation.performer = [{ display: rawReading.recordedBy }];
  }
  if (opts.idempotencyKey) {
    observation.identifier = [
      {
        system: 'urn:vitals-integration-platform:idempotency-key',
        value: opts.idempotencyKey,
      },
    ];
  }
  return observation;
}

// Validate + normalize a raw reading into a FHIR Observation.
// Returns { valid, observation?, reason?, normalizedValue?, unit? }
function normalizeReading(rawReading, tenant, opts = {}) {
  const result = validateReading(rawReading, tenant);
  if (!result.valid) {
    return { valid: false, reason: result.reason };
  }
  const observation = toFhirObservation(rawReading, result, opts);
  return {
    valid: true,
    observation,
    normalizedValue: result.normalizedValue,
    unit: result.unit,
  };
}

module.exports = { normalizeReading, toFhirObservation };
