import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { format } from "node:util";

// Registro en archivo, un JSON por línea: app-AAAA-MM-DD.log.
// Dónde vive (en este orden):
//   1. LOG_DIR, si está definida.
//   2. <sitio>/persistent-logs, si la app corre en <sitio>/hbuilds/versions/<uuid> (Hostinger):
//      fuera de las carpetas de versión, así sobrevive a los despliegues y se puede leer por SSH.
//   3. ./logs (desarrollo local).
// Guarda tal cual lo que la app ya escribe con console.* (ver instrumentation.ts) más los errores
// de peticiones; nunca contraseñas ni claves (redact) ni el texto de los mensajes de WhatsApp.

const RETENTION_DAYS = 14;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_MESSAGE_CHARS = 4000;

export type LogLevel = "info" | "warn" | "error";
export type LogEntry = { t: string; level: LogLevel; scope: string; msg: string; data?: unknown; pid: number };

let dirCache: string | null = null;

export function logDir() {
  if (dirCache) return dirCache;
  const cwd = (() => {
    try {
      return realpathSync(process.cwd());
    } catch {
      return process.cwd();
    }
  })();
  const site = cwd.match(/^(.*)[\\/]hbuilds[\\/]versions[\\/][^\\/]+/)?.[1];
  dirCache = process.env.LOG_DIR || (site ? path.join(site, "persistent-logs") : path.join(cwd, "logs"));
  return dirCache;
}

const REDACTIONS: [RegExp, string][] = [
  [/sk-ant-[A-Za-z0-9_-]+/g, "sk-ant-***"],
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer ***"],
  [/("?(?:password|passwordHash|passphrase|token|apiKey|botApiKey|secret)"?\s*[:=]\s*)"?[^"\s,}]+"?/gi, "$1\"***\""],
  [/([?&](?:token|key|secret)=)[^&\s]+/gi, "$1***"],
];

export function redact(text: string) {
  return REDACTIONS.reduce((acc, [re, to]) => acc.replace(re, to), text);
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

function prune(dir: string) {
  const limit = Date.now() - RETENTION_DAYS * 86_400_000;
  for (const name of readdirSync(dir)) {
    if (!/^app-\d{4}-\d{2}-\d{2}\.log$/.test(name)) continue;
    const file = path.join(dir, name);
    if (statSync(file).mtimeMs < limit) unlinkSync(file);
  }
}

let lastPrune = "";

export function writeLog(level: LogLevel, scope: string, msg: string, data?: unknown) {
  try {
    const now = new Date();
    const dir = logDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    if (lastPrune !== dayKey(now)) {
      lastPrune = dayKey(now);
      prune(dir);
    }
    const file = path.join(dir, `app-${dayKey(now)}.log`);
    if (existsSync(file) && statSync(file).size > MAX_FILE_BYTES) return;
    const entry: LogEntry = { t: now.toISOString(), level, scope, msg: redact(msg).slice(0, MAX_MESSAGE_CHARS), pid: process.pid };
    if (data !== undefined) entry.data = JSON.parse(redact(JSON.stringify(data) ?? "null"));
    appendFileSync(file, `${JSON.stringify(entry)}\n`);
  } catch {
    // El registro nunca debe tumbar la app.
  }
}

/** Registro explícito (eventos que interesa poder analizar después). */
export const logger = {
  info: (scope: string, msg: string, data?: unknown) => writeLog("info", scope, msg, data),
  warn: (scope: string, msg: string, data?: unknown) => writeLog("warn", scope, msg, data),
  error: (scope: string, msg: string, data?: unknown) => writeLog("error", scope, msg, data),
};

const g = globalThis as unknown as { logCaptureInstalled?: boolean };

/** Además de la consola, todo console.log/warn/error pasa al archivo. El scope sale de un "[etiqueta]" inicial. */
export function installConsoleCapture() {
  if (g.logCaptureInstalled) return;
  g.logCaptureInstalled = true;
  const levels: [keyof Pick<Console, "log" | "info" | "warn" | "error">, LogLevel][] = [
    ["log", "info"],
    ["info", "info"],
    ["warn", "warn"],
    ["error", "error"],
  ];
  for (const [method, level] of levels) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      original(...args);
      const text = format(...args);
      writeLog(level, text.match(/^\[([^\]]+)\]/)?.[1] ?? "app", text);
    };
  }
  // Solo observa: no cambia lo que Node hace ante un error sin atajar (sigue cerrando el proceso).
  process.on("uncaughtExceptionMonitor", (err, origin) => {
    writeLog("error", "proceso", `${origin}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  });
}

/** Lee entradas de un día, las más recientes al final. */
export function readLog(opts: { date?: string; lines?: number; level?: LogLevel; scope?: string; q?: string }) {
  const date = opts.date && /^\d{4}-\d{2}-\d{2}$/.test(opts.date) ? opts.date : dayKey(new Date());
  const file = path.join(logDir(), `app-${date}.log`);
  if (!existsSync(file)) return { file: path.basename(file), total: 0, entries: [] as LogEntry[] };
  const rank = { info: 0, warn: 1, error: 2 } as const;
  const q = opts.q?.toLowerCase();
  // ponytail: lee el archivo entero (tope 20 MB); si molesta, leer desde el final.
  const all = readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as LogEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is LogEntry => e !== null)
    .filter((e) => (!opts.level || rank[e.level] >= rank[opts.level]) && (!opts.scope || e.scope === opts.scope) && (!q || `${e.scope} ${e.msg}`.toLowerCase().includes(q)));
  return { file: path.basename(file), total: all.length, entries: all.slice(-Math.min(Math.max(opts.lines ?? 200, 1), 2000)) };
}

export function listLogFiles() {
  const dir = logDir();
  if (!existsSync(dir)) return { dir, files: [] as { name: string; bytes: number }[] };
  return {
    dir,
    files: readdirSync(dir)
      .filter((n) => /^app-\d{4}-\d{2}-\d{2}\.log$/.test(n))
      .sort()
      .map((name) => ({ name, bytes: statSync(path.join(dir, name)).size })),
  };
}
