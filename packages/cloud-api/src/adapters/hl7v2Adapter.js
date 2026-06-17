const net = require('net');
const { buildOruR01, wrapMllp, VT, FS, CR } = require('./hl7Message');

// HL7 v2 adapter: builds an ORU^R01 message and sends it over MLLP/TCP
// to the tenant's HL7 interface engine.
// Tenant config shape: { type: 'hl7v2', config: { host, port, sendingApplication, ... } }

function send(observation, rawReading, config, opts = {}) {
  const normalized = { normalizedValue: opts.normalizedValue, unit: opts.unit };
  const message = buildOruR01(rawReading, normalized, config, opts);
  const framed = wrapMllp(message);

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: config.host, port: config.port });
    let ackData = '';
    let settled = false;

    const timeoutMs = config.timeoutMs || 5000;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error('HL7v2 adapter: timed out waiting for ACK'));
    }, timeoutMs);

    socket.on('connect', () => {
      socket.write(framed);
    });

    socket.on('data', (chunk) => {
      ackData += chunk.toString();
      if (ackData.includes(FS + CR) || ackData.includes(FS)) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.end();
        const ackBody = ackData.replace(VT, '').replace(FS + CR, '').replace(FS, '');
        if (ackBody.includes('AA') || ackBody.includes('CA')) {
          resolve({ delivered: true, ack: ackBody, message });
        } else {
          reject(new Error(`HL7v2 adapter: negative ACK: ${ackBody}`));
        }
      }
    });

    socket.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`HL7v2 adapter: connection error: ${err.message}`));
    });

    socket.on('close', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('HL7v2 adapter: connection closed before ACK received'));
    });
  });
}

module.exports = { send };
