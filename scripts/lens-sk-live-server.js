#!/usr/bin/env node
// Servidor puente local para Lens-SK "modo live": deja que el ícono nuevo
// del toolbar ("pedir cambio" / "aplicar a archivos reales") le mande un
// evento a un Claude Code que esté escuchando este mismo proceso, y que la
// respuesta de Claude vuelva al navegador que sigue esperando en el mismo
// fetch(). No es el dev server del proyecto (Vite/browser-sync) — es un
// proceso HTTP aparte, solo para este puente.
//
// "npm run dev" lo levanta como una tarea paralela más (ver package.json,
// script "live"). Si el puerto ya está tomado, loguea y sigue vivo sin
// tirar abajo el resto de "npm run dev".
//
// Entrega de eventos vía Server-Sent Events (GET /events), NO long-poll:
// v1 de este servidor usaba un GET /poll de ~55s que Claude tenía que
// relanzar constantemente (visible como actividad/notificaciones sin
// ninguna razón real la mayoría de las veces — "se ve prendido revisando
// cosas todo el rato"). SSE es empuje real: Node mantiene la respuesta de
// /events abierta y le escribe una línea "data: ..." apenas hay un evento,
// sin que nadie tenga que "preguntar de nuevo" cada minuto. Se eligió sobre
// un WebSocket real porque http.createServer ya sabe mantener una respuesta
// abierta (es lo mismo que ya hace /event, en la otra dirección) — un WS de
// verdad exigiría el handshake completo a mano o sumar la dependencia "ws"
// sin necesidad, para el mismo resultado.
//
// Estado 100% en memoria, un solo pedido a la vez (un dev, una pestaña) —
// a propósito no hay journal durable tipo el de la skill "impeccable": acá
// no hace falta recuperar sesiones entre reinicios.
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const PORT = process.env.LENS_SK_LIVE_PORT ? Number(process.env.LENS_SK_LIVE_PORT) : 8137;
// Identifica de qué proyecto es este bridge (varios pueden correr en
// paralelo, cada uno en su propio puerto — ver lens-sk-resolve-ports.js).
// LOCAL_URL es único por proyecto (a diferencia del nombre de carpeta del
// tema, que se repite en todos los sitios clonados de este mismo boilerplate).
const PROJECT_ID = (process.env.LOCAL_URL || '').replace(/^https?:\/\//, '').replace(/\/$/, '') || path.basename(path.resolve(__dirname, '..'));
const REPLY_TIMEOUT_MS = 5 * 60 * 1000;
// Las preguntas standalone (/ask-user) esperan una decisión humana con
// calma (leer opciones, pensar, a veces escribir texto propio) — 5 min
// (pensado para el flujo automático de "Aplicar") es corto de verdad: bug
// real de esta sesión, la primera prueba expiró antes de que se pudiera
// contestar. 30 min da margen sin dejar el slot único trabado para siempre
// si el usuario simplemente no vuelve.
const ASK_USER_TIMEOUT_MS = 30 * 60 * 1000;
const ROOT = path.resolve(__dirname, '..');
const PROJECT_MAP_PATH = path.join(ROOT, '.lens-sk-cache', 'project-map.json');
const ASSET_DIR = path.join(ROOT, '.lens-sk-cache', 'screenshots');
const MAX_ASSET_BYTES = 3 * 1024 * 1024;
// Ledger durable de "qué overrides de vista previa ya quedaron aplicados de
// verdad en disco" — reemplaza depender de que el fetch de POST /event del
// navegador siga vivo para recibir el /reply: si el commit dispara un
// rebuild + reload de browser-sync más rápido que ese viaje de ida y vuelta,
// el fetch se aborta con la navegación y esa limpieza se perdía para
// siempre (bug real). Acá se escribe apenas se resuelve el /reply con
// ok:true, y el navegador la consume sola en cada carga de página (ver
// GET /pending-commit-cleanup, consumePendingCommitCleanup en toolbar.js) —
// no depende de que ninguna conexión particular siga abierta.
const PENDING_CLEANUP_PATH = path.join(ROOT, '.lens-sk-cache', 'pending-commit-cleanup.json');

// El único pedido en curso: { id, event, res, timeout }.
// "res" es la respuesta HTTP del POST /event original del navegador —
// se mantiene abierta (sin .end()) hasta que llega el /reply con el mismo id.
let activeCommand = null;

// Pregunta STANDALONE de Claude al usuario — a diferencia de
// activeCommand.question (que solo existe A MITAD de un pedido que el
// NAVEGADOR inició con POST /event), esto lo dispara CLAUDE en cualquier
// momento, sin que haya ningún pedido en curso. Mismo patrón "held open"
// que POST /event↔POST /reply pero en la dirección contraria: quien manda
// POST /ask-user es Claude, y esa respuesta HTTP se mantiene abierta hasta
// que el navegador conteste con POST /answer-user — así Claude no necesita
// pollear nada, la respuesta le llega directo como resultado de su propio
// POST. El navegador, en cambio, sí tiene que pollear (GET /ask-user, ver
// pollAskUser en toolbar.js) porque a diferencia de Claude no tiene ninguna
// conexión abierta esperando algo de este servidor.
// { id, question, options, multiSelect, res, timeout }.
let activeQuestion = null;

// Conexiones SSE abiertas (respuestas HTTP de GET /events que nunca se
// cierran solas) — normalmente una sola, pero soporta más de una sin
// problema. GET /status reporta "connected" en base a esta lista, no a
// ningún poll puntual: una conexión SSE dura toda la sesión, así que es una
// señal estable de verdad ("¿hay alguien escuchando ahora?"), no algo que
// parpadea cada rato.
let sseClients = [];

function randomId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Un valor nuevo cada vez que arranca este proceso ("npm run dev") — el
// navegador lo compara contra el último que vio (ver checkLiveHelper en
// toolbar.js) para saber si hubo un reinicio real desde la última vez y, si
// lo hubo, limpiar el HISTORIAL de Asistencia Claude de esa página (los
// cambios ya aplicados en la sesión anterior ya son parte del proyecto).
const BOOT_ID = randomId();

function withCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJSON(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function countObjectKeys(value) {
  return value && typeof value === 'object' ? Object.keys(value).length : 0;
}

function summarizeLiveEvent(event) {
  if (!event) return null;
  return {
    id: event.id || null,
    type: event.type || null,
    createdAt: event.createdAt || null,
    ageMs: event.createdAt ? Date.now() - event.createdAt : null,
    selector: event.selector || null,
    tag: event.tag || null,
    classes: event.classes || null,
    textSnippet: event.textSnippet || null,
    componentGuess: event.componentGuess || null,
    parent: event.parent || null,
    prompt: event.prompt || event.request || event.message || '',
    fileHint: event.fileHint || null,
    twcssMode: !!event.twcssMode,
    currentOverridesCount: countObjectKeys(event.currentOverrides),
    descendantOverridesCount: Array.isArray(event.descendantOverrides) ? event.descendantOverrides.length : 0,
    attachmentsCount: Array.isArray(event.attachments) ? event.attachments.length : 0,
    attachmentNames: Array.isArray(event.attachments) ? event.attachments.map((a) => a && a.name).filter(Boolean) : [],
    domTreeTruncated: !!event.domTreeTruncated,
    hasScreenshot: !!event.screenshot,
    screenshotAsset: event.screenshotAsset || event.screenshotRef || null,
  };
}

function summarizeActiveCommand(command) {
  if (!command) return null;
  const event = summarizeLiveEvent(command.event);
  return Object.assign({}, event, {
    progress: command.progress || '',
    hasQuestion: !!command.question,
    question: command.question || '',
    hasAnswer: !!command.answer,
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function readBinaryBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(Object.assign(new Error('payload_too_large'), { code: 'payload_too_large' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks, total)));
    req.on('error', reject);
  });
}

function safeAssetName(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || randomId();
}

function assetContentTypeFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.md') return 'text/markdown; charset=utf-8';
  return 'application/octet-stream';
}

// Cada entrada: { page, selector, ids: {prop: id} }. Un dev/una pestaña
// (mismo criterio que el resto de este servidor) — no hace falta locking,
// solo leer/escribir el array entero cada vez.
function readPendingCleanup() {
  try { return JSON.parse(fs.readFileSync(PENDING_CLEANUP_PATH, 'utf8')); } catch (e) { return []; }
}
function writePendingCleanup(entries) {
  try {
    fs.mkdirSync(path.dirname(PENDING_CLEANUP_PATH), { recursive: true });
    fs.writeFileSync(PENDING_CLEANUP_PATH, JSON.stringify(entries));
  } catch (e) { console.error('[lens-sk-live] no se pudo escribir el ledger de limpieza:', e.message); }
}
// Ids de override committeados con éxito, sacados del evento ORIGINAL (lo
// que el navegador mandó en POST /event, no lo que la IA devuelve en
// /reply) — commit trae ids/page a nivel evento, commit-all los trae por
// item (mismo "page" para todos, siempre la página actual).
function appendPendingCleanupFromCommit(event) {
  if (!event || !event.page) return;
  var entries = [];
  if (event.type === 'commit' && event.ids && Object.keys(event.ids).length) {
    entries.push({ page: event.page, selector: event.selector, ids: event.ids });
  } else if (event.type === 'commit-all' && Array.isArray(event.items)) {
    event.items.forEach(function (item) {
      if (item && item.ids && Object.keys(item.ids).length) entries.push({ page: event.page, selector: item.selector, ids: item.ids });
    });
  }
  if (!entries.length) return;
  writePendingCleanup(readPendingCleanup().concat(entries));
}

function resetScreenshotAssets() {
  try {
    fs.rmSync(ASSET_DIR, { recursive: true, force: true });
    fs.mkdirSync(ASSET_DIR, { recursive: true });
    console.log(`[lens-sk-live] capturas temporales limpiadas: ${path.relative(ROOT, ASSET_DIR)}`);
  } catch (e) {
    console.error('[lens-sk-live] no se pudo limpiar la carpeta de capturas:', e.message);
  }
}

function broadcastEvent(event) {
  const line = 'data: ' + JSON.stringify(event) + '\n\n';
  sseClients.forEach((c) => { try { c.write(line); } catch (e) { /* cliente ya cortado, se limpia solo en close */ } });
}

const server = http.createServer(async (req, res) => {
  withCors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/status') {
    sendJSON(res, 200, { connected: sseClients.length > 0, bootId: BOOT_ID, project: PROJECT_ID });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/requests') {
    sendJSON(res, 200, {
      connected: sseClients.length > 0,
      listeners: sseClients.length,
      bootId: BOOT_ID,
      project: PROJECT_ID,
      activeCommand: summarizeActiveCommand(activeCommand),
      activeQuestion: activeQuestion ? {
        id: activeQuestion.id,
        question: activeQuestion.question,
        optionsCount: Array.isArray(activeQuestion.options) ? activeQuestion.options.length : 0,
        multiSelect: !!activeQuestion.multiSelect,
      } : null,
    });
    return;
  }

  // Mapa componente/card → archivo (ver lens-sk-project-map.js), servido
  // tal cual para que el NAVEGADOR resuelva "Ir al código" solo, sin
  // pedirme ayuda salvo que no encuentre nada — ver doLiveLocate en
  // toolbar.js. Si el mapa todavía no se generó (servidor recién
  // arrancado), 503 — el navegador reintenta más tarde, no rompe nada.
  if (req.method === 'GET' && url.pathname === '/project-map.json') {
    fs.readFile(PROJECT_MAP_PATH, 'utf8', (err, raw) => {
      if (err) { sendJSON(res, 503, { error: 'not_ready', message: 'El mapa del proyecto todavía no se generó.' }); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(raw);
    });
    return;
  }

  // ¿Sigue existiendo este archivo? Único chequeo real de "¿el link está
  // roto?" que se puede hacer sin adivinar — no hay forma de saber si
  // vscode://file/... realmente abrió algo (el navegador no da ninguna
  // devolución de eso), pero al menos esto confirma que el archivo que el
  // mapa apunta sigue estando ahí antes de intentarlo.
  if (req.method === 'GET' && url.pathname === '/file-exists') {
    const rel = url.searchParams.get('path') || '';
    const resolved = path.resolve(ROOT, rel);
    if (!resolved.startsWith(ROOT + path.sep)) { sendJSON(res, 400, { error: 'invalid_path' }); return; }
    sendJSON(res, 200, { exists: fs.existsSync(resolved) });
    return;
  }

  // Assets pesados del pedido live (por ahora screenshots): el navegador sube
  // el JPEG como binario y el evento SSE manda solo una referencia corta. Esto
  // evita meter data:image/...;base64 dentro del JSON, que era lo que inflaba
  // fuerte el contexto/tokens de cada pedido.
  if (req.method === 'POST' && url.pathname === '/asset') {
    let buf;
    try { buf = await readBinaryBody(req, MAX_ASSET_BYTES); } catch (e) {
      sendJSON(res, e && e.code === 'payload_too_large' ? 413 : 400, { error: e && e.code ? e.code : 'invalid_asset' });
      return;
    }
    if (!buf.length) { sendJSON(res, 400, { error: 'empty_asset' }); return; }
    const id = safeAssetName(url.searchParams.get('id'));
    const kind = safeAssetName(url.searchParams.get('kind') || 'screenshot');
    const requestedName = safeAssetName(url.searchParams.get('name'));
    const mime = String(req.headers['content-type'] || 'image/jpeg').split(';')[0].trim().toLowerCase();
    // Texto extraído de PDF/DOCX/XLSX (ver uploadLiveTextAsset en
    // toolbar.js) sube igual que una captura, pero con extensión .md en vez
    // de forzar siempre una de imagen.
    const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp'
      : (mime === 'text/markdown' || mime === 'text/plain') ? '.md' : '.jpg';
    const baseName = url.searchParams.has('name') ? `${requestedName}-${Date.now().toString(36)}-${id}-${kind}` : `${Date.now().toString(36)}-${id}-${kind}`;
    const filename = `${baseName}${ext}`;
    const absPath = path.join(ASSET_DIR, filename);
    try {
      fs.mkdirSync(ASSET_DIR, { recursive: true });
      fs.writeFileSync(absPath, buf);
    } catch (e) {
      sendJSON(res, 500, { error: 'write_failed', message: e.message });
      return;
    }
    sendJSON(res, 200, {
      ok: true,
      asset: {
        kind: 'file',
        id,
        role: kind,
        mime,
        bytes: buf.length,
        filename,
        path: absPath,
        relPath: path.relative(ROOT, absPath),
        url: `http://localhost:${PORT}/asset/${encodeURIComponent(filename)}`,
      },
    });
    return;
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname.indexOf('/asset/') === 0) {
    const filename = path.basename(decodeURIComponent(url.pathname.slice('/asset/'.length)));
    const absPath = path.join(ASSET_DIR, filename);
    if (!absPath.startsWith(ASSET_DIR + path.sep)) { sendJSON(res, 400, { error: 'invalid_asset_path' }); return; }
    fs.readFile(absPath, (err, data) => {
      if (err) { sendJSON(res, 404, { error: 'asset_not_found' }); return; }
      res.writeHead(200, { 'Content-Type': assetContentTypeFor(filename), 'Cache-Control': 'no-store', 'Content-Length': data.length });
      if (req.method === 'HEAD') { res.end(); return; }
      res.end(data);
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(': conectado\n\n'); // línea de comentario SSE (arranca con ":") — solo para abrir el stream, un lector de "data:" la ignora sola
    // Si un pedido ya estaba parado ANTES de que este cliente se conectara
    // (nadie escuchaba en el instante exacto del clic), reenviárselo ahora —
    // sin esto, ese evento se transmitía al vacío una sola vez y se perdía
    // para siempre, aunque el navegador siguiera esperando su respuesta
    // (bug real: pasó en la primera prueba de esta versión).
    if (activeCommand) res.write('data: ' + JSON.stringify(activeCommand.event) + '\n\n');
    sseClients.push(res);
    req.on('close', () => {
      sseClients = sseClients.filter((c) => c !== res);
      // Si el último Claude que escuchaba se fue (VSCode cerrado a mitad de
      // un pedido) y quedó un activeCommand sin resolver, no lo dejamos
      // colgado hasta el timeout de 5 min: se resuelve como fallido ya
      // mismo, así el slot único queda libre al toque — si no, el próximo
      // clic del navegador choca con 409 "busy" sin que haya ninguna razón
      // visible para quien está del otro lado (bug real, reportado por el
      // usuario).
      if (sseClients.length === 0 && activeCommand) {
        clearTimeout(activeCommand.timeout);
        sendJSON(activeCommand.res, 200, { ok: false, error: 'disconnected', message: 'La IA se desconectó antes de responder. Probá de nuevo.' });
        activeCommand = null;
      }
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/event') {
    if (activeCommand) { sendJSON(res, 409, { error: 'busy', message: 'Ya hay un pedido en curso, esperá a que termine.' }); return; }
    let body;
    try { body = await readBody(req); } catch (e) { sendJSON(res, 400, { error: 'invalid_json' }); return; }
    // El id lo genera el NAVEGADOR (ver buildLiveEventPayload en toolbar.js),
    // no este servidor — así el navegador puede empezar a pollear
    // GET /progress?id=... para ese mismo pedido sin esperar a la respuesta
    // final (que recién llega en /reply, quién sabe cuándo). Fallback a
    // randomId() solo por si algún cliente viejo no manda id.
    const id = body.id || randomId();
    const event = Object.assign({}, body, { id, createdAt: Date.now() });
    const timeout = setTimeout(() => {
      if (activeCommand && activeCommand.id === id) {
        sendJSON(activeCommand.res, 504, { ok: false, error: 'timeout', message: 'La IA no respondió a tiempo.' });
        activeCommand = null;
      }
    }, REPLY_TIMEOUT_MS);
    activeCommand = { id, event, res, timeout, progress: '', question: null, answer: null };
    broadcastEvent(event);
    // OJO: no se llama res.end() acá — esta respuesta se resuelve en /reply.
    return;
  }

  // Progreso legible durante la espera (ver liveStatus/pollLiveProgress en
  // toolbar.js) — reemplaza el "Esperando a Claude…" estático por lo que
  // yo vaya reportando ("Leyendo archivo…", "Aplicando…", etc.) mientras
  // trabajo en el pedido. Puramente informativo: si no llega ningún
  // /progress, el navegador se queda con el texto genérico de siempre.
  if (req.method === 'POST' && url.pathname === '/progress') {
    let body;
    try { body = await readBody(req); } catch (e) { sendJSON(res, 400, { error: 'invalid_json' }); return; }
    if (activeCommand && activeCommand.id === body.id) activeCommand.progress = String(body.text || '');
    sendJSON(res, 200, { ok: true });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/progress') {
    const id = url.searchParams.get('id') || '';
    const match = activeCommand && activeCommand.id === id;
    sendJSON(res, 200, { progress: match ? activeCommand.progress : '', question: match ? (activeCommand.question || '') : '' });
    return;
  }

  // Pregunta de Claude al usuario A MITAD de un pedido en curso — protocolo
  // /ask ↔ /answer. Existe para que Claude NUNCA tenga que frenar a
  // preguntar algo por el chat de VSCode mientras resuelve un pedido de
  // esta herramienta: el usuario puede estar mirando el navegador, no esa
  // ventana. La pregunta viaja por el mismo poll que ya usa /progress (GET
  // /progress?id=... ahora también trae "question"); la respuesta del
  // usuario vuelve por el mismo canal SSE que Claude ya tiene abierto en
  // /events (mismo truco que /cancel: broadcastEvent con el id), sin que
  // Claude tenga que abrir ningún poll nuevo de su lado.
  if (req.method === 'POST' && url.pathname === '/ask') {
    let body;
    try { body = await readBody(req); } catch (e) { sendJSON(res, 400, { error: 'invalid_json' }); return; }
    if (!activeCommand || activeCommand.id !== body.id) { sendJSON(res, 404, { error: 'no_such_event', message: 'No hay ningún pedido pendiente con ese id.' }); return; }
    activeCommand.question = String(body.question || '');
    activeCommand.answer = null;
    sendJSON(res, 200, { ok: true });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/answer') {
    let body;
    try { body = await readBody(req); } catch (e) { sendJSON(res, 400, { error: 'invalid_json' }); return; }
    if (!activeCommand || activeCommand.id !== body.id || !activeCommand.question) { sendJSON(res, 404, { error: 'no_pending_question', message: 'No hay ninguna pregunta pendiente con ese id.' }); return; }
    activeCommand.question = null;
    activeCommand.answer = String(body.answer || '');
    broadcastEvent({ id: activeCommand.id, answered: true, answer: activeCommand.answer });
    sendJSON(res, 200, { ok: true });
    return;
  }

  // El navegador cancela el pedido en curso (botón Cancelar) — a diferencia
  // de un timeout o una desconexión, esto es SIEMPRE a pedido explícito del
  // usuario. Resuelve el /event pendiente de inmediato (el navegador no
  // sigue esperando ni un segundo más) y avisa por SSE con el mismo id para
  // que Claude, si todavía está trabajando en eso, se entere y no siga.
  if (req.method === 'POST' && url.pathname === '/cancel') {
    let body;
    try { body = await readBody(req); } catch (e) { sendJSON(res, 400, { error: 'invalid_json' }); return; }
    if (!activeCommand || activeCommand.id !== body.id) {
      sendJSON(res, 404, { error: 'no_such_event', message: 'No hay ningún pedido pendiente con ese id.' });
      return;
    }
    clearTimeout(activeCommand.timeout);
    sendJSON(activeCommand.res, 200, { ok: false, error: 'cancelled', message: 'Cancelado por el usuario.' });
    broadcastEvent({ id: activeCommand.id, cancelled: true });
    activeCommand = null;
    sendJSON(res, 200, { ok: true });
    return;
  }

  // POST /ask-user: Claude pregunta algo SIN que haya un pedido en curso
  // (ver comentario largo junto a "let activeQuestion" más arriba). Un solo
  // slot, igual que activeCommand — un dev, una pregunta a la vez. Esta
  // respuesta HTTP NO se cierra acá: se resuelve recién en /answer-user.
  if (req.method === 'POST' && url.pathname === '/ask-user') {
    if (activeQuestion) { sendJSON(res, 409, { error: 'busy', message: 'Ya hay una pregunta esperando respuesta.' }); return; }
    let body;
    try { body = await readBody(req); } catch (e) { sendJSON(res, 400, { error: 'invalid_json' }); return; }
    const id = randomId();
    const timeout = setTimeout(() => {
      if (activeQuestion && activeQuestion.id === id) {
        sendJSON(activeQuestion.res, 504, { ok: false, error: 'timeout', message: 'El usuario no respondió a tiempo.' });
        activeQuestion = null;
      }
    }, ASK_USER_TIMEOUT_MS);
    activeQuestion = {
      id,
      question: String(body.question || ''),
      options: Array.isArray(body.options) ? body.options : null,
      multiSelect: !!body.multiSelect,
      res,
      timeout,
    };
    // Si Claude se desconecta (el propio POST /ask-user se corta) antes de
    // que el usuario responda, no dejar el slot único trabado para siempre
    // — mismo criterio que la limpieza de activeCommand en el close de
    // /events.
    res.on('close', () => {
      if (activeQuestion && activeQuestion.id === id) {
        clearTimeout(activeQuestion.timeout);
        activeQuestion = null;
      }
    });
    return;
  }

  // GET /ask-user: poll liviano del navegador (ver pollAskUser en
  // toolbar.js) — a diferencia de Claude, que recibe la respuesta directo
  // como resultado de su propio POST /ask-user, el navegador no tiene
  // ninguna conexión abierta esperando esto, así que tiene que preguntar.
  if (req.method === 'GET' && url.pathname === '/ask-user') {
    if (!activeQuestion) { sendJSON(res, 200, { pending: false }); return; }
    sendJSON(res, 200, {
      pending: true,
      id: activeQuestion.id,
      question: activeQuestion.question,
      options: activeQuestion.options,
      multiSelect: activeQuestion.multiSelect,
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/answer-user') {
    let body;
    try { body = await readBody(req); } catch (e) { sendJSON(res, 400, { error: 'invalid_json' }); return; }
    if (!activeQuestion || activeQuestion.id !== body.id) { sendJSON(res, 404, { error: 'no_such_question', message: 'No hay ninguna pregunta pendiente con ese id.' }); return; }
    clearTimeout(activeQuestion.timeout);
    if (body.cancelled) {
      sendJSON(activeQuestion.res, 200, { ok: false, error: 'cancelled', message: 'El usuario cerró la pregunta sin responder.' });
    } else {
      sendJSON(activeQuestion.res, 200, { ok: true, answer: body.answer });
    }
    activeQuestion = null;
    sendJSON(res, 200, { ok: true });
    return;
  }

  // El navegador la llama una vez al cargar (ver consumePendingCommitCleanup
  // en toolbar.js) con su propia pathname — devuelve SOLO las entradas de
  // ESA página y las saca del ledger (consumidas); el resto (de otras
  // páginas que todavía no recargaron) queda esperando su turno.
  if (req.method === 'GET' && url.pathname === '/pending-commit-cleanup') {
    const page = url.searchParams.get('page') || '';
    const all = readPendingCleanup();
    const matched = all.filter((e) => e.page === page);
    const rest = all.filter((e) => e.page !== page);
    if (matched.length) writePendingCleanup(rest);
    sendJSON(res, 200, { entries: matched });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/reply') {
    let body;
    try { body = await readBody(req); } catch (e) { sendJSON(res, 400, { error: 'invalid_json' }); return; }
    if (!activeCommand || activeCommand.id !== body.id) {
      sendJSON(res, 404, { error: 'no_such_event', message: 'No hay ningún pedido pendiente con ese id.' });
      return;
    }
    clearTimeout(activeCommand.timeout);
    if (body.ok) appendPendingCleanupFromCommit(activeCommand.event);
    // Reenviar el body de /reply COMPLETO (menos "id", que es plomería
    // interna de este servidor, no del protocolo evento↔respuesta) — este
    // servidor es un relay tonto, no tiene por qué conocer el esquema de
    // cada tipo de evento (suggest/commit/locate/lo que venga después).
    const browserResponse = Object.assign({}, body, { ok: !!body.ok });
    delete browserResponse.id;
    sendJSON(activeCommand.res, 200, browserResponse);
    activeCommand = null;
    sendJSON(res, 200, { ok: true });
    return;
  }

  sendJSON(res, 404, { error: 'not_found' });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // "npm run dev" ya corre lens-sk-resolve-ports.js antes de esto (hook
    // "predev"), que reserva un puerto libre de verdad — llegar hasta acá
    // ocupado es una carrera rarísima (algo lo tomó en el instante entre
    // ese chequeo y este listen). No matar nada: para el caso normal de
    // "otro proyecto ya está corriendo en este puerto" no hay forma de
    // saber si es seguro tocar ese proceso, así que no se insiste.
    console.log(`[lens-sk-live] puerto ${PORT} ya está en uso — correlo de nuevo con "npm run dev" para que se reserve otro puerto libre.`);
    return;
  }
  console.error('[lens-sk-live] error del servidor:', err);
});

// Mapa "clase → archivo:línea" (ver lens-sk-project-map.js): se levanta en
// background, sin bloquear el arranque del servidor — si tarda o falla, el
// puente navegador↔Claude sigue funcionando igual (el mapa es un atajo de
// velocidad, nunca una dependencia dura).
// Dos generadores de mapa, uno por familia de stack — el navegador ya sabe
// resolver por los dos tipos de llave a la vez (clase CSS o nombre de
// componente React, ver resolveComponentFileClientSide en toolbar.js), así
// que solo hace falta elegir cuál PRODUCE el mapa acá, sin tocar nada del
// lado del cliente.
function pickProjectMapGenerator() {
  const pkgPath = path.join(ROOT, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
      if (deps.react || deps.next) return 'lens-sk-react-component-map.js';
    } catch {
      // package.json corrupto/ilegible: seguir con el resto de las señales.
    }
  }
  // Convención de theme WordPress: style.css con cabecera "Theme Name:", o
  // functions.php en la raíz.
  if (fs.existsSync(path.join(ROOT, 'functions.php'))) return 'lens-sk-project-map.js';
  const styleCssPath = path.join(ROOT, 'style.css');
  if (fs.existsSync(styleCssPath) && /Theme Name:/i.test(fs.readFileSync(styleCssPath, 'utf8'))) {
    return 'lens-sk-project-map.js';
  }
  return null;
}

function startProjectMapWatcher() {
  const generator = pickProjectMapGenerator();
  if (!generator) {
    console.log('[lens-sk-live] no se detectó un stack conocido (React/Next.js o WordPress) — sin mapa de componentes, "Ir al código" va a pedirlo por el puente live.');
    return;
  }
  const child = spawn(process.execPath, [path.join(__dirname, generator), '--watch'], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  child.on('error', (err) => console.error('[lens-sk-live] no se pudo levantar el mapa del proyecto:', err.message));
}

function onListening() {
  console.log(`[lens-sk-live] escuchando en http://localhost:${PORT} para "${PROJECT_ID}" (GET /status, GET /requests, GET /events [SSE], POST /asset, GET /asset/:file, POST /event, POST /reply, POST+GET /progress, POST /ask, POST /answer, GET /pending-commit-cleanup)`);
  startProjectMapWatcher();
}

resetScreenshotAssets();
// El puerto ya llega resuelto y libre de verdad (lens-sk-resolve-ports.js,
// hook "predev" — bind de prueba con net.createServer, no un chequeo de
// nuestro propio protocolo) — no hace falta detectar ni matar instancias
// viejas acá, ver el error EADDRINUSE de "server.on('error', ...)" arriba.
server.listen(PORT, onListening);
