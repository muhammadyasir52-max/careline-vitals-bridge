const express = require('express');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const port = process.env.PORT || process.env.BLE_CAPTURE_PORT || 7000;
// Loopback-only by default - this page can read/send patient vitals, and
// in the desktop deployment should never be reachable from other machines
// on the network. Render (HOST=0.0.0.0) is the exception, for the cloud demo.
const host = process.env.HOST || '127.0.0.1';
app.listen(port, host, () => {
  console.log(`CareLine BLE Capture (Web Bluetooth) running at http://${host}:${port}`);
  console.log('Open this URL in Chrome or Edge on Android or Windows.');
});
