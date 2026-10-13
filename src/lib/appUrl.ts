// Dirección pública de la app (NEXTAUTH_URL): la única fuente para armar un link
// absoluto que se pega FUERA de la app — un WhatsApp, un correo, un documento.
// Dentro de la app los links van relativos (/projects/…) y el navegador ya sabe
// en qué dominio está; afuera hace falta el dominio completo.
export function appUrl() {
  const url = process.env.NEXTAUTH_URL?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}

/** Ruta de la app (/projects/…) → link absoluto. Sin NEXTAUTH_URL devuelve null, nunca un dominio inventado. */
export function absoluteUrl(path: string) {
  const base = appUrl();
  return base ? `${base}${path.startsWith("/") ? path : `/${path}`}` : null;
}
