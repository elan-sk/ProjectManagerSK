import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { uploadSearchDirs } from "@/lib/persistentUploads";
import { htmlShell } from "@/lib/htmlShell";

// Enlace directo de un prototipo HTML subido (/uploads/<uuid>.html se reescribe acá, ver next.config.ts).
// Público, igual que el resto de /uploads: quien tenga el enlace (ej. un cliente) lo puede ver.
export const dynamic = "force-dynamic";

const MAX_BYTES = 20 * 1024 * 1024;

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.html$/.test(name) || name.includes("..")) return new Response("No encontrado", { status: 404 });

  for (const dir of await uploadSearchDirs()) {
    const file = path.join(dir, name);
    const info = await stat(file).catch(() => null);
    if (!info?.isFile() || info.size > MAX_BYTES) continue;
    return new Response(htmlShell(name, await readFile(file, "utf8")), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=0, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return new Response("No encontrado", { status: 404 });
}
