import { unlink } from "node:fs/promises";
import { findUploadPath } from "@/lib/persistentUploads";
import { countFileReferences } from "@/lib/fileReferences";

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
  // Spec 001: cuenta TODOS los usos (adjuntos, íconos, fotos y textos), ver fileReferences.ts.
  if ((await countFileReferences(fileUrl)) > 0) return;
  const file = await findUploadPath(fileUrl);
  if (file) await unlink(file).catch(() => {});
}
