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
  // Default to loopback-only: this holds patient vitals data behind a
  // single shared API key, and in the local desktop deployment it should
  // never be reachable from other machines on the hospital network. Render
  // (HOST=0.0.0.0) is the one legitimate exception, for the cloud demo.
  const host = process.env.HOST || '127.0.0.1';
  app.listen(port, host, () => {
    console.log(`CareLine Vitals Bridge cloud-api listening on ${host}:${port}`);
  });
}

module.exports = { createApp };
