// Identidad del visitante externo sin cuenta (punto 16 confirmado con el
// usuario) — se pide una sola vez (nombre + cargo opcional) y se guarda en
// ESTE navegador para no volver a pedirla. Compartido entre PublicCommentThread
// y el panel de Aceptación (ambos identifican al cliente de la misma forma).
const IDENTITY_KEY = "pmsk-share-identity";

export type ShareIdentity = { name: string; role: string };

export function loadShareIdentity(): ShareIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveShareIdentity(identity: ShareIdentity) {
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    // localStorage puede fallar (ventana privada, storage bloqueado) — la
    // identidad simplemente se vuelve a pedir la próxima vez, no es crítico.
  }
}
