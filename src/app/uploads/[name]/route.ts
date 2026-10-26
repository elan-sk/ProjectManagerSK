import { ARCHIVE_MIME } from "@/lib/uploadLimits";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { uploadSearchDirs } from "@/lib/persistentUploads";
import { logger } from "@/lib/logger";
import { thumbnailFile } from "@/lib/thumbnails";
import { parseThumbWidth, RASTER_IMAGE } from "@/lib/thumbUrl";

// Sirve los archivos subidos (/uploads/<uuid>.<ext>) leyendo el disco EN CADA
// petición. Next en producción arma una sola vez, al arrancar, la lista de lo
// que hay en public/: cualquier archivo que aparece después (subido, copiado
// desde una versión anterior o enlazado por persistentUploads.ts) daba 404
// hasta el siguiente reinicio. Lo que sí está en esa lista lo sigue sirviendo
// Next directamente; esta ruta atiende el resto.
export const dynamic = "force-dynamic";

// Mismos tipos que acepta la subida (uploadFile.ts) — nada ejecutable; el SVG va con CSP sandbox.
const MIME: Record<string, string> = {
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
  ...ARCHIVE_MIME,
};

const SVG_CSP = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:";

const notFound = () => new Response("No encontrado", { status: 404 });

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  // Solo nombres simples (letras, números, punto, guion): nada de rutas ni ".." — y solo tipos permitidos.
  const ext = MIME[path.extname(name).toLowerCase()];
  if (!ext || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.includes("..")) return notFound();
  const width = RASTER_IMAGE.test(name) ? parseThumbWidth(new URL(request.url).searchParams.get("w")) : null;

  for (const dir of await uploadSearchDirs()) {
    let file = path.join(dir, name);
    let type = ext;
    if (!(await stat(file).catch(() => null))?.isFile()) continue;
    if (width) {
      // Miniatura (?w=): si sharp falla con una imagen rara, se sirve el original en vez de romper la vista.
      const thumb = await thumbnailFile(file, name, width).catch((err) => {
        logger.warn("uploads", `No se pudo achicar ${name}`, { error: err instanceof Error ? err.message : String(err) });
        return null;
      });
      if (thumb) [file, type] = [thumb, "image/webp"];
    }
    const info = await stat(file);
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
      headers: {
        "Content-Type": type,
        "Content-Length": String(info.size),
        // El nombre es la huella del contenido (uploadFile.contentFileName): nunca cambia, el navegador lo guarda.
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        // Abierto directo, un SVG es un documento: sin scripts ni cargas externas aunque algo se colara.
        ...(type === "image/svg+xml" && { "Content-Security-Policy": SVG_CSP }),
      },
    });
  }
  return notFound();
}
