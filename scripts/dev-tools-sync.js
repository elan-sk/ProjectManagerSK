const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const SRC = path.resolve(__dirname, '../dev-tools');
const DEST = path.resolve(__dirname, '../public/dev-tools');
const ENV_PATH = path.resolve(__dirname, '../.env');
const FILES = ['toolbar.js', 'modern-screenshot.umd.js'];

const mode = process.argv[2];

if (mode === 'clean') {
  fs.rmSync(DEST, { recursive: true, force: true });
} else if (mode === 'copy') {
  fs.mkdirSync(DEST, { recursive: true });
  // lens-sk-resolve-port.js (predev, corre justo antes que este script) ya
  // dejó el puerto real del bridge en .env — toolbar.js trae ese número
  // hardcodeado (var LIVE_HELPER_PORT = 8137), así que al copiarlo se
  // reescribe con el valor real de esta corrida en vez del default fijo.
  const env = fs.existsSync(ENV_PATH) ? dotenv.parse(fs.readFileSync(ENV_PATH)) : {};
  const livePort = env.LENS_SK_LIVE_PORT || 8137;
  FILES.forEach((f) => {
    const src = path.join(SRC, f);
    if (!fs.existsSync(src)) return;
    if (f === 'toolbar.js') {
      const content = fs.readFileSync(src, 'utf8')
        .replace(/var LIVE_HELPER_PORT = \d+;/, `var LIVE_HELPER_PORT = ${livePort};`);
      fs.writeFileSync(path.join(DEST, f), content);
    } else {
      fs.copyFileSync(src, path.join(DEST, f));
    }
  });
} else {
  console.error('Uso: node dev-tools-sync.js copy|clean');
  process.exit(1);
}
