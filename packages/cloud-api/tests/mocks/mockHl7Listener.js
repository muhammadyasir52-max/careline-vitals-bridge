const net = require('net');
const { VT, FS, CR } = require('../../src/adapters/hl7Message');

// A minimal mock HL7 v2 MLLP listener for testing hl7v2Adapter.
// start() returns { server, port, getReceived(), setFailMode(bool), stop() }
function start() {
  const received = [];
  let failMode = false;
  let dropConnection = false;

  const server = net.createServer((socket) => {
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      if (buffer.includes(FS + CR)) {
        const message = buffer.replace(VT, '').replace(FS + CR, '');
        received.push(message);

        if (dropConnection) {
          socket.destroy();
          return;
        }

        const controlId = (message.split('\r')[0].split('|')[9]) || '1';
        const ackCode = failMode ? 'AE' : 'AA';
        const ack =
          `MSH|^~\\&|MockEMR|MockFacility|VitalsPlatform|VitalsPlatform|20260613000000||ACK^R01|${controlId}|P|2.3\r` +
          `MSA|${ackCode}|${controlId}\r`;
        socket.write(VT + ack + FS + CR);
        buffer = '';
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        port,
        host: '127.0.0.1',
        getReceived: () => received,
        setFailMode: (val) => {
          failMode = val;
        },
        setDropConnection: (val) => {
          dropConnection = val;
        },
        stop: () => new Promise((res) => server.close(res)),
      });
    });
  });
}

module.exports = { start };
