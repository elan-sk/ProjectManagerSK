import { access, mkdir, writeFile } from "node:fs/promises";
import { uploadWriteDir } from "@/lib/persistentUploads";
import path from "node:path";
import { createHash } from "node:crypto";
import { isTooLarge, TOO_LARGE_MESSAGE } from "@/lib/uploadLimits";

// El navegador a veces reporta un mimetype no estándar según cómo el sistema
// operativo asocie la extensión — ej. con WPS Office instalado, un .xlsx
// llega como "application/wps-office.xlsx" en vez del tipo real de Excel.
// La extensión es más confiable que file.type entre sistemas, así que es la
// fuente de verdad; file.type queda como respaldo para archivos sin
// extensión reconocida. Whitelist deliberada: nada ejecutable. El SVG entra
// solo si pasa unsafeSvgReason() y se sirve con CSP sandbox (next.config.ts y
// /uploads/[name]), porque puede llevar <script> — vector de XSS almacenado.
const EXTENSION_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".md": "text/markdown",
};
const ALLOWED_MIME_TYPES = new Set(Object.values(EXTENSION_MIME));

// HTML (prototipos): solo lo sube quien pasa allowHtml (admin o PM). Es el único
// tipo con código propio; por eso se sirve siempre aislado (CSP sandbox, ver
// next.config.ts y /uploads/[name]) y se muestra en un iframe con sandbox.
const HTML_EXTENSIONS = new Set([".html", ".htm"]);

// Rechaza (no "limpia": limpiar con regex se puede burlar) todo SVG con algo
// capaz de ejecutar código o cargar contenido externo. Un SVG de decoración
// exportado de Figma/Illustrator no usa nada de esto.
const SVG_FORBIDDEN: [RegExp, string][] = [
  [/<\s*script/i, "scripts"],
  [/<\s*(foreignObject|iframe|embed|object|handler|listener)\b/i, "contenido incrustado"],
  [/\son[a-z]+\s*=/i, "eventos"],
  [/(javascript|vbscript)\s*:|data\s*:\s*text\/html/i, "enlaces con código"],
  [/<!ENTITY/i, "entidades XML"],
  // Solo enlaces internos (#id) o imágenes rasterizadas incrustadas; un "&#..." al inicio también cae acá.
  [/\bhref\s*=\s*["']\s*(?!#|data:image\/(?:png|jpe?g|gif|webp);)/i, "enlaces externos"],
  [/attributeName\s*=\s*["']\s*(?:xlink:)?href/i, "enlaces animados"],
];

/** Motivo por el que un SVG no es seguro, o null si se puede guardar. */
export function unsafeSvgReason(buffer: Buffer): string | null {
  if (buffer.includes(0)) return "codificación no soportada"; // UTF-16 esquivaría las reglas
  const text = buffer.toString("utf8");
  if (!/<svg[\s>]/i.test(text)) return "no es un SVG válido";
  return SVG_FORBIDDEN.find(([re]) => re.test(text))?.[1] ?? null;
}

/** Tipo MIME a partir de la extensión del nombre (mismo criterio que la subida). */
export function mimeFromFileName(name: string) {
  return EXTENSION_MIME[path.extname(name).toLowerCase()] ?? "application/octet-stream";
}

export type UploadResult =
  | { ok: true; url: string; name: string; mimeType: string }
  | { ok: false; status: number; error: string };

// Compartido entre /api/upload (sesión) y /api/upload/public (link
// compartido, punto 15/16) — misma validación de tipo/tamaño en un solo
// lugar, para que cambiar el límite (como ya pasó una vez) no quede
// desincronizado entre los dos endpoints.
export async function saveUploadedFile(file: File, options: { allowHtml?: boolean } = {}): Promise<UploadResult> {
  const ext = path.extname(file.name).toLowerCase();
  const isHtml = HTML_EXTENSIONS.has(ext);
  if (isHtml && !options.allowHtml) {
    return { ok: false, status: 403, error: "Solo el PM de un proyecto o un administrador pueden subir archivos HTML." };
  }
  const mimeType = isHtml ? "text/html" : EXTENSION_MIME[ext] ?? file.type;

  if (!isHtml && !EXTENSION_MIME[ext] && !ALLOWED_MIME_TYPES.has(file.type)) {
    return { ok: false, status: 415, error: "Tipo de archivo no permitido. Usá imagen, PDF, Word, Excel, PowerPoint o texto/CSV." };
  }
  if (isTooLarge(file)) {
    return { ok: false, status: 413, error: TOO_LARGE_MESSAGE };
  }

  // Seguridad: la extensión guardada sale SIEMPRE de la lista blanca. Antes un "x.svg" declarado
  // como image/png pasaba (el tipo lo manda el navegador) y quedaba servido como SVG ejecutable.
  const safeExt = normalizeExt(isHtml ? ".html" : EXTENSION_MIME[ext] ? ext : Object.keys(EXTENSION_MIME).find((e) => EXTENSION_MIME[e] === file.type)!);
  const buffer = Buffer.from(await file.arrayBuffer());
  // Spec 001: el nombre es la huella del contenido — el mismo archivo subido
  // otra vez (en cualquier lugar, con cualquier nombre) termina en la misma
  // copia física. Cada lugar conserva el nombre con que se cargó (`name`).
  const fileName = contentFileName(buffer, safeExt);
  if (safeExt === ".svg") {
    const reason = unsafeSvgReason(buffer);
    if (reason) return { ok: false, status: 415, error: `El SVG no se puede subir porque contiene ${reason}. Se admite solo como imagen (formas, colores, degradados).` };
  }
  const uploadsDir = await uploadWriteDir();
  await mkdir(uploadsDir, { recursive: true });
  const target = path.join(uploadsDir, fileName);
  // Ya existe = es el mismo contenido: no se reescribe. Dos subidas simultáneas
  // escribirían los mismos bytes en el mismo nombre (inofensivo).
  if (!(await access(target).then(() => true, () => false))) await writeFile(target, buffer);

  return { ok: true, url: `/uploads/${fileName}`, name: file.name, mimeType };
}

// .jpeg y .jpg (y .htm/.html) son el mismo tipo: una sola extensión para que
// el mismo contenido dé siempre el mismo nombre.
const EXT_ALIASES: Record<string, string> = { ".jpeg": ".jpg", ".htm": ".html" };
export function normalizeExt(ext: string) {
  return EXT_ALIASES[ext.toLowerCase()] ?? ext.toLowerCase();
}

/** Nombre físico por contenido: SHA-256 en hexadecimal + extensión normalizada. */
export function contentFileName(buffer: Buffer, ext: string) {
  return `${createHash("sha256").update(buffer).digest("hex")}${normalizeExt(ext)}`;
}

/** true si el nombre ya es por contenido (64 hex + extensión). */
export function isContentFileName(name: string) {
  return /^[0-9a-f]{64}\.[a-z0-9]+$/.test(name);
}
