#!/usr/bin/env node
// Reserva un puerto libre para el puente live de Lens-SK y lo deja en .env
// como LENS_SK_LIVE_PORT — así, si hay otro proyecto con su propio puente
// corriendo en paralelo, cada uno usa el suyo en vez de compartirlo sin
// darse cuenta. Adaptado del lens-sk-resolve-ports.js del skill (esa
// versión también resuelve un puerto de browser-sync, que no aplica acá:
// "next dev" ya trae su propio hot-reload, no hay proxy que resolver).
const net = require('net');
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.resolve(__dirname, '..', '.env');
const LENS_SK_BASE_PORT = 8137;

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)));
  });
}

async function findFreePort(start) {
  let port = start;
  // eslint-disable-next-line no-await-in-loop
  while (!(await isPortFree(port))) port++;
  return port;
}

function upsertEnv(key, value) {
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(content)) {
    content = content.replace(re, line);
  } else {
    content += (content === '' || content.endsWith('\n') ? '' : '\n') + line + '\n';
  }
  fs.writeFileSync(ENV_PATH, content);
}

(async () => {
  const livePort = await findFreePort(LENS_SK_BASE_PORT);
  upsertEnv('LENS_SK_LIVE_PORT', livePort);
  console.log(`[lens-sk-resolve-port] bridge en puerto ${livePort}`);
})();
