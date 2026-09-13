import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// El navegador a veces reporta un mimetype no estándar según cómo el sistema
// operativo asocie la extensión — ej. con WPS Office instalado, un .xlsx
// llega como "application/wps-office.xlsx" en vez del tipo real de Excel.
// La extensión es más confiable que file.type entre sistemas, así que es la
// fuente de verdad; file.type queda como respaldo para archivos sin
// extensión reconocida. Whitelist deliberada: nada ejecutable ni SVG (el SVG
// puede llevar <script> y se serviría desde /public sin sandboxing — vector
// de XSS almacenado).
const EXTENSION_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".csv": "text/csv",
};
const ALLOWED_MIME_TYPES = new Set(Object.values(EXTENSION_MIME));
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB — evidencias/capturas, no video

export type UploadResult =
  | { ok: true; url: string; name: string; mimeType: string }
  | { ok: false; status: number; error: string };

// Compartido entre /api/upload (sesión) y /api/upload/public (link
// compartido, punto 15/16) — misma validación de tipo/tamaño en un solo
// lugar, para que cambiar el límite (como ya pasó una vez) no quede
// desincronizado entre los dos endpoints.
export async function saveUploadedFile(file: File): Promise<UploadResult> {
  const ext = path.extname(file.name).toLowerCase();
  const mimeType = EXTENSION_MIME[ext] ?? file.type;

  if (!EXTENSION_MIME[ext] && !ALLOWED_MIME_TYPES.has(file.type)) {
    return { ok: false, status: 415, error: "Tipo de archivo no permitido. Usá imagen, PDF, Word, Excel, PowerPoint o texto/CSV." };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, status: 413, error: "El archivo supera los 20MB." };
  }

  const fileName = `${randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const uploadsDir = path.join(process.cwd(), "public/uploads");
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(path.join(uploadsDir, fileName), buffer);

  return { ok: true, url: `/uploads/${fileName}`, name: file.name, mimeType };
}
