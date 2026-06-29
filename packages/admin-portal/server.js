const express = require('express');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname, 'src')));

const port = process.env.PORT || process.env.ADMIN_PORTAL_PORT || 4000;
// Loopback-only by default - configures EMR adapter credentials, should
// never be reachable from other machines on the network in local mode.
const host = process.env.HOST || '127.0.0.1';
app.listen(port, host, () => {
  console.log(`Admin portal listening on ${host}:${port}`);
});
