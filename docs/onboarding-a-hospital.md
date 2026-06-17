# Onboarding a new hospital/clinic tenant

1. Open the admin portal and fill in "Onboard a new hospital / clinic":
   - **Tenant name** — e.g. "Riverside Hospital".
   - **EMR adapter type**:
     - `FHIR R4` — provide the hospital's FHIR base URL (and optional bearer
       auth header). Readings are sent as `Observation` resources via
       `POST {baseUrl}/Observation`.
     - `HL7 v2 (MLLP)` — provide the host/port of the hospital's HL7
       interface engine (e.g. Mirth Connect channel). Readings are sent as
       `ORU^R01` messages over MLLP.
     - `Custom REST` — provide a URL (and optional auth header) for a
       bespoke EMR endpoint. An optional field-mapping can remap our
       canonical field names to the customer's expected JSON keys.
2. Submit the form. The response includes the new tenant's `tenantId` and
   `apiKey`.
3. Distribute the `apiKey` to the site's device-capture app (mobile-capture
   or edge-agent) — it's sent as the `X-Api-Key` header on every
   `POST /api/v1/vitals` call.
4. Use the tenant's dashboard (`/api/v1/tenants/:tenantId/dashboard`, or the
   "View dashboard" link in the admin portal) to monitor data flow health:
   last reading received, sync success rate, and dead-lettered deliveries
   that need attention.
