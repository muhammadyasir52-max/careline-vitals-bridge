const store = require('../models/store');

// Resolves the tenant from the X-Api-Key header and attaches it to req.tenant.
function tenantAuth(req, res, next) {
  const apiKey = req.header('X-Api-Key');
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing X-Api-Key header' });
  }
  const tenant = store.getTenantByApiKey(apiKey);
  if (!tenant) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  req.tenant = tenant;
  next();
}

module.exports = { tenantAuth };
