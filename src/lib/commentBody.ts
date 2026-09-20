// Lógica pura (sin DOM ni base de datos) de los comentarios internos:
// imágenes pegadas y ventana de edición.

export const COMMENT_MAX_LENGTH = 3000;

/** Un comentario se puede editar/eliminar solo por su autor y solo durante este tiempo. */
export const COMMENT_EDIT_WINDOW_MS = 5 * 60 * 1000;

// Las imágenes pegadas, los archivos, los enlaces y las @menciones viven como
// marcas dentro del propio texto del comentario — sin tabla ni migración por
// cada tipo. Solo se reconocen rutas de /uploads/ (nombre simple) y enlaces
// http(s); nunca URLs arbitrarias de otro tipo.
//   [[img:/uploads/x.png]]  [[file:/uploads/x.pdf|Nombre.pdf]]
//   [[link:https://…|Título]]  [[user:ID|Nombre]]
const MARKER = /\[\[(?:img:(\/uploads\/[A-Za-z0-9._-]+)|file:(\/uploads\/[A-Za-z0-9._-]+)\|([^\]|]+)|link:(https?:\/\/[^\]|\s]+)\|([^\]|]+)|user:([A-Za-z0-9_-]+)\|([^\]|]+))\]\]/g;

// El nombre visible no puede romper la marca.
const safe = (text: string) => text.replace(/[\[\]|]/g, "-").trim();

export const imageMarker = (url: string) => `[[img:${url}]]`;
export const fileMarker = (url: string, name: string) => `[[file:${url}|${safe(name) || "archivo"}]]`;
export const linkMarker = (url: string, title: string) => `[[link:${url}|${safe(title) || url}]]`;
export const mentionMarker = (id: string, name: string) => `[[user:${id}|${safe(name)}]]`;

export type CommentPart =
  | { type: "text"; text: string }
  | { type: "image"; url: string }
  | { type: "file"; url: string; name: string }
  | { type: "link"; url: string; name: string }
  | { type: "mention"; id: string; name: string };

/** Parte el texto en trozos de texto, imágenes, archivos, enlaces y menciones, en orden, para dibujarlo. */
export function splitCommentBody(body: string): CommentPart[] {
  const parts: CommentPart[] = [];
  let last = 0;
  for (const m of body.matchAll(MARKER)) {
    if (m.index > last) parts.push({ type: "text", text: body.slice(last, m.index) });
    if (m[1]) parts.push({ type: "image", url: m[1] });
    else if (m[2]) parts.push({ type: "file", url: m[2], name: m[3] });
    else if (m[4]) parts.push({ type: "link", url: m[4], name: m[5] });
    else parts.push({ type: "mention", id: m[6], name: m[7] });
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push({ type: "text", text: body.slice(last) });
  return parts;
}

/** Ids (sin repetir) de las personas @mencionadas en el comentario. */
export function commentMentionIds(body: string): string[] {
  return [...new Set(splitCommentBody(body).flatMap((p) => (p.type === "mention" ? [p.id] : [])))];
}

/** Archivos y enlaces del comentario: se copian a los Insumos de la tarea/proyecto. */
export function commentAttachments(body: string) {
  const seen = new Set<string>();
  const out: { kind: "image" | "file" | "link"; url: string; name: string }[] = [];
  for (const p of splitCommentBody(body)) {
    if (p.type === "image" || p.type === "file" || p.type === "link") {
      if (seen.has(p.url)) continue;
      seen.add(p.url);
      out.push({ kind: p.type, url: p.url, name: p.type === "image" ? p.url.split("/").pop() ?? "imagen" : p.name });
    }
  }
  return out;
}

/** Texto corto para listas (campana, buscador): las marcas se leen como «[imagen]», «@Nombre», etc. */
export function commentPreview(body: string): string {
  return commentPlainText(body).replace(/\s+/g, " ").trim();
}

/** Texto completo sin marcas — el que viaja por WhatsApp. */
export function commentPlainText(body: string): string {
  return splitCommentBody(body)
    .map((p) => {
      if (p.type === "text") return p.text;
      if (p.type === "image") return "[imagen]";
      if (p.type === "file") return `[archivo: ${p.name}]`;
      if (p.type === "link") return `${p.name} (${p.url})`;
      return `@${p.name}`;
    })
    .join("");
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
