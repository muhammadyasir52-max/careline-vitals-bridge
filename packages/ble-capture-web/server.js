const express = require('express');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const port = process.env.PORT || process.env.BLE_CAPTURE_PORT || 7000;
app.listen(port, () => {
  console.log(`CareLine BLE Capture (Web Bluetooth) running at http://localhost:${port}`);
  console.log('Open this URL in Chrome or Edge on Android or Windows.');
});
