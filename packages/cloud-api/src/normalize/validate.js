const { getVitalDefinition } = require('./loinc');

// Convert a value into the canonical unit for a vitalType, if a known
// conversion is supported (currently temperature C<->F).
function convertToCanonicalUnit(vitalType, value, unit) {
  const def = getVitalDefinition(vitalType);
  if (unit === def.defaultUnit) {
    return { value, unit: def.defaultUnit };
  }
  if (vitalType === 'body_temperature' && unit === 'degF') {
    return { value: ((value - 32) * 5) / 9, unit: 'Cel' };
  }
  // Unknown unit for this vital type - pass through unchanged so the
  // caller's range check can flag it.
  return { value, unit };
}

// Validates a single raw reading. Returns { valid, normalizedValue, unit, reason }
function validateReading(rawReading, tenant) {
  const { vitalType, value, unit } = rawReading;

  let def;
  try {
    def = getVitalDefinition(vitalType);
  } catch (err) {
    return { valid: false, reason: err.message };
  }

  if (typeof value !== 'number' || Number.isNaN(value)) {
    return { valid: false, reason: `value must be a number, got: ${value}` };
  }

  const sourceUnit = unit || def.defaultUnit;
  const { value: convertedValue, unit: convertedUnit } = convertToCanonicalUnit(
    vitalType,
    value,
    sourceUnit
  );

  if (convertedUnit !== def.defaultUnit) {
    return {
      valid: false,
      reason: `unsupported unit "${sourceUnit}" for vitalType "${vitalType}" (expected ${def.defaultUnit})`,
    };
  }

  const range = (tenant && tenant.unitPreferences && tenant.unitPreferences[vitalType]) || def.validRange;
  if (convertedValue < range.min || convertedValue > range.max) {
    return {
      valid: false,
      reason: `value ${convertedValue} ${convertedUnit} out of range [${range.min}, ${range.max}] for ${vitalType}`,
    };
  }

  return { valid: true, normalizedValue: convertedValue, unit: convertedUnit };
}

module.exports = { validateReading, convertToCanonicalUnit };
