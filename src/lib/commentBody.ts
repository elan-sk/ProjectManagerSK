// Lógica pura (sin DOM ni base de datos) de los comentarios internos:
// imágenes pegadas y ventana de edición.

export const COMMENT_MAX_LENGTH = 3000;

/** Un comentario se puede editar/eliminar solo por su autor y solo durante este tiempo. */
export const COMMENT_EDIT_WINDOW_MS = 5 * 60 * 1000;

// Las imágenes pegadas se suben a /uploads y el comentario guarda una marca
// con su ruta dentro del propio texto — sin tabla ni migración nueva. Solo se
// reconocen rutas de /uploads/ (nombre simple), nunca URLs arbitrarias.
const IMAGE_MARKER = /\[\[img:(\/uploads\/[A-Za-z0-9._-]+)\]\]/g;

export const imageMarker = (url: string) => `[[img:${url}]]`;

export type CommentPart = { type: "text"; text: string } | { type: "image"; url: string };

/** Parte el texto en trozos de texto e imágenes, en orden, para dibujarlo. */
export function splitCommentBody(body: string): CommentPart[] {
  const parts: CommentPart[] = [];
  let last = 0;
  for (const m of body.matchAll(IMAGE_MARKER)) {
    if (m.index > last) parts.push({ type: "text", text: body.slice(last, m.index) });
    parts.push({ type: "image", url: m[1] });
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push({ type: "text", text: body.slice(last) });
  return parts;
}

/** Texto corto para listas (campana, buscador): las marcas de imagen se leen como «[imagen]». */
export function commentPreview(body: string): string {
  return body.replace(IMAGE_MARKER, "[imagen]").replace(/\s+/g, " ").trim();
}

/**
 * null si `userId` puede editar/eliminar el comentario ahora; si no, el
 * motivo en lenguaje simple. Lo usan las acciones del servidor (validación
 * real) — la interfaz solo esconde los botones, no reemplaza esto.
 */
export function commentEditError(authorId: string, userId: string, createdAt: Date | number, now: number): string | null {
  if (authorId !== userId) return "Solo quien escribió el comentario puede modificarlo.";
  const created = typeof createdAt === "number" ? createdAt : createdAt.getTime();
  if (now - created > COMMENT_EDIT_WINDOW_MS) return "Ya pasaron los 5 minutos: este comentario ya no se puede editar ni eliminar.";
  return null;
}
