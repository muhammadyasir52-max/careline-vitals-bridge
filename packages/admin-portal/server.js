const express = require('express');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname, 'src')));

const port = process.env.ADMIN_PORTAL_PORT || 4000;
app.listen(port, () => {
  console.log(`Admin portal listening on port ${port}`);
});
