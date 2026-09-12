import { NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";

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

// ponytail: guarda en public/uploads/ para el prototipo local. Al pasar a
// Hostinger/producción, cambiar esto por un put() a Supabase Storage — el
// resto del flujo (Attachment.fileUrl) no cambia, solo esta función.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });

  const ext = path.extname(file.name).toLowerCase();
  const mimeType = EXTENSION_MIME[ext] ?? file.type;

  if (!EXTENSION_MIME[ext] && !ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Tipo de archivo no permitido. Usá imagen, PDF, Word, Excel, PowerPoint o texto/CSV." },
      { status: 415 }
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "El archivo supera los 20MB." }, { status: 413 });
  }

  const fileName = `${randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(process.cwd(), "public/uploads", fileName), buffer);

  return NextResponse.json({
    url: `/uploads/${fileName}`,
    name: file.name,
    mimeType,
  });
}
