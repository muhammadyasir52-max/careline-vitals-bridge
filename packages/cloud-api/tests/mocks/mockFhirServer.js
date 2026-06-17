const http = require('http');

// A minimal mock FHIR server for testing fhirAdapter.
// start() returns { server, port, getReceived(), setFailMode(bool) }
function start() {
  const received = [];
  let failMode = false;

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || !req.url.startsWith('/Observation')) {
      res.writeHead(404).end();
      return;
    }

    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      if (failMode) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'service unavailable' }));
        return;
      }
      const observation = JSON.parse(body);
      received.push(observation);
      res.writeHead(201, { 'Content-Type': 'application/fhir+json' });
      res.end(JSON.stringify({ resourceType: 'Observation', id: `obs-${received.length}` }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        port,
        baseUrl: `http://127.0.0.1:${port}`,
        getReceived: () => received,
        setFailMode: (val) => {
          failMode = val;
        },
        stop: () => new Promise((res) => server.close(res)),
      });
    });
  });
}

module.exports = { start };
