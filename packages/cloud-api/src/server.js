const express = require('express');
const vitalsRouter = require('./routes/vitals');
const tenantsRouter = require('./routes/tenants');

function createApp() {
  const app = express();
  app.use(express.json());

  // Permissive CORS so the admin portal (served separately) can call this API.
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api/v1/vitals', vitalsRouter);
  app.use('/api/v1/tenants', tenantsRouter);

  return app;
}

if (require.main === module) {
  const app = createApp();
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`CareLine Vitals Bridge cloud-api listening on port ${port}`);
  });
}

module.exports = { createApp };
