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
  // Ante cualquier duda (no se pudo contar), el archivo se queda: nunca se borra algo
  // que quizá se usa, y el error no le llega a quien quitó el adjunto.
  try {
    await deleteIfUnreferenced(fileUrl);
  } catch (err) {
    console.error(`[fileCleanup] no se pudo comprobar si ${fileUrl} se usa; no se borra`, err);
  }
}

async function deleteIfUnreferenced(fileUrl: string) {
  const [a, pa, aa, dl, ev, msg, rma] = await Promise.all([
    prisma.attachment.count({ where: { fileUrl } }),
    prisma.projectAttachment.count({ where: { fileUrl } }),
    prisma.adjustmentAttachment.count({ where: { fileUrl } }),
    prisma.reviewDeliverable.count({ where: { fileUrl } }),
    prisma.reviewCheckEvidence.count({ where: { fileUrl } }),
    // En memoria y no con `contains`: ese LIKE falla en producción por mezcla de collations.
    // ponytail: recorre todos los mensajes internos; pasar a una tabla de referencias si crecen mucho.
    prisma.internalMessage.findMany({ select: { body: true } }).then((rows) => rows.filter((m) => m.body.includes(fileUrl)).length),
    prisma.reviewMessageAttachment.count({ where: { fileUrl } }),
  ]);
  if (a + pa + aa + dl + ev + msg + rma > 0) return;
  await unlink(path.join(process.cwd(), "public", fileUrl)).catch(() => {});
}
