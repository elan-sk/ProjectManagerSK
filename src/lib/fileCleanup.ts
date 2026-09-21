import { unlink } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";

/**
 * Borra el archivo físico de /uploads solo si ya nada lo referencia. Como la
 * galería de medios deja reusar el mismo archivo en varias tareas/comentarios,
 * quitar UN adjunto no puede borrar el archivo de los demás.
 * Se llama DESPUÉS de eliminar la fila del adjunto.
 */
export async function deleteFileIfUnused(fileUrl: string) {
  if (!/^\/uploads\/[A-Za-z0-9._-]+$/.test(fileUrl)) return;
  const [a, pa, aa, dl, ev, msg, rma] = await Promise.all([
    prisma.attachment.count({ where: { fileUrl } }),
    prisma.projectAttachment.count({ where: { fileUrl } }),
    prisma.adjustmentAttachment.count({ where: { fileUrl } }),
    prisma.reviewDeliverable.count({ where: { fileUrl } }),
    prisma.reviewCheckEvidence.count({ where: { fileUrl } }),
    prisma.internalMessage.count({ where: { body: { contains: fileUrl } } }),
    prisma.reviewMessageAttachment.count({ where: { fileUrl } }),
  ]);
  if (a + pa + aa + dl + ev + msg + rma > 0) return;
  await unlink(path.join(process.cwd(), "public", fileUrl)).catch(() => {});
}
