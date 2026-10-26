// Límite de intentos (login web, login de la API, recuperación de contraseña).
// ponytail: en memoria del proceso — se reinicia con el servidor y no se comparte
// entre procesos; pasar a una tabla si Hostinger llega a correr varios a la vez.
const attempts = new Map<string, { count: number; firstAt: number }>();

function current(key: string, windowMs: number) {
  const entry = attempts.get(key);
  if (entry && Date.now() - entry.firstAt > windowMs) {
    attempts.delete(key);
    return undefined;
  }
  return entry;
}

export function isBlocked(key: string, max: number, windowMs: number) {
  return (current(key, windowMs)?.count ?? 0) >= max;
}

export function recordAttempt(key: string, windowMs: number) {
  const entry = current(key, windowMs);
  if (entry) entry.count++;
  else attempts.set(key, { count: 1, firstAt: Date.now() });
}

export function clearAttempts(key: string) {
  attempts.delete(key);
}

// Login: 5 fallos seguidos por cuenta bloquean 15 minutos (web y API comparten el contador).
export const LOGIN_MAX = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_BLOCKED_MESSAGE = "Demasiados intentos fallidos. Se puede volver a intentar en 15 minutos.";
export const loginKey = (identifier: string) => `login:${identifier.trim().toLowerCase()}`;

// Login por IP: frena a quien prueba muchas cuentas distintas desde el mismo lugar (el límite por
// cuenta no lo ve). Un login correcto NO limpia este contador, así no se resetea entrando con una cuenta propia.
export const LOGIN_IP_MAX = 20;
export const loginIpKey = (ip: string) => `login-ip:${ip}`;

// IP real del visitante. Caddy (el proxy del VPS) descarta el X-Forwarded-For que mande el cliente
// y pone el suyo, así que el primer valor es confiable mientras la app solo sea accesible por Caddy.
export function clientIp(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0].trim() || headers.get("x-real-ip")?.trim() || "unknown";
}

export const isLoginBlocked = (identifier: string, ip: string) =>
  isBlocked(loginKey(identifier), LOGIN_MAX, LOGIN_WINDOW_MS) || isBlocked(loginIpKey(ip), LOGIN_IP_MAX, LOGIN_WINDOW_MS);

export function recordLoginFailure(identifier: string, ip: string) {
  recordAttempt(loginKey(identifier), LOGIN_WINDOW_MS);
  recordAttempt(loginIpKey(ip), LOGIN_WINDOW_MS);
}
