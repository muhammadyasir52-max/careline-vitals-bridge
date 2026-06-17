// FHIR R4 adapter: POSTs an Observation resource to the tenant's FHIR base URL.
// Tenant config shape: { type: 'fhir', config: { baseUrl, authHeader? } }

async function send(observation, rawReading, config) {
  const url = `${config.baseUrl.replace(/\/$/, '')}/Observation`;
  const headers = { 'Content-Type': 'application/fhir+json' };
  if (config.authHeader) {
    headers.Authorization = config.authHeader;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(observation),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`FHIR adapter: EMR responded ${response.status} ${body}`);
  }

  const body = await response.json().catch(() => ({}));
  return { delivered: true, emrResponse: body };
}

module.exports = { send };
