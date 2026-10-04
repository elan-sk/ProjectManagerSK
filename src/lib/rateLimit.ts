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
