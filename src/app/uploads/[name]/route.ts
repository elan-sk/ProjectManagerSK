import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { uploadSearchDirs } from "@/lib/persistentUploads";

// Sirve los archivos subidos (/uploads/<uuid>.<ext>) leyendo el disco EN CADA
// petición. Next en producción arma una sola vez, al arrancar, la lista de lo
// que hay en public/: cualquier archivo que aparece después (subido, copiado
// desde una versión anterior o enlazado por persistentUploads.ts) daba 404
// hasta el siguiente reinicio. Lo que sí está en esa lista lo sigue sirviendo
// Next directamente; esta ruta atiende el resto.
export const dynamic = "force-dynamic";

// Mismos tipos que acepta la subida (uploadFile.ts) — nada ejecutable ni SVG.
const MIME: Record<string, string> = {
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

const notFound = () => new Response("No encontrado", { status: 404 });

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  // Solo nombres simples (letras, números, punto, guion): nada de rutas ni ".." — y solo tipos permitidos.
  const type = MIME[path.extname(name).toLowerCase()];
  if (!type || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.includes("..")) return notFound();

  for (const dir of await uploadSearchDirs()) {
    const file = path.join(dir, name);
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) continue;
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
      headers: {
        "Content-Type": type,
        "Content-Length": String(info.size),
        "Cache-Control": "public, max-age=0, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return notFound();
}
