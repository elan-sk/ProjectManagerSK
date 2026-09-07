import { NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";

// Whitelist deliberada: nada ejecutable ni SVG (el SVG puede llevar <script>
// y se serviría desde /public sin sandboxing — vector de XSS almacenado).
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
]);
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB — evidencias/capturas, no video

// ponytail: guarda en public/uploads/ para el prototipo local. Al pasar a
// Hostinger/producción, cambiar esto por un put() a Supabase Storage — el
// resto del flujo (Attachment.fileUrl) no cambia, solo esta función.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Tipo de archivo no permitido. Usá imagen (PNG/JPG/WEBP/GIF) o PDF." },
      { status: 415 }
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "El archivo supera los 15MB." }, { status: 413 });
  }

  const ext = path.extname(file.name);
  const fileName = `${randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(process.cwd(), "public/uploads", fileName), buffer);

  return NextResponse.json({
    url: `/uploads/${fileName}`,
    name: file.name,
    mimeType: file.type,
  });
}
