import { prisma } from "@/lib/prisma";

/**
 * Spec 001: todos los lugares de la base que pueden apuntar a un archivo de
 * /uploads. Una sola lista para el borrado seguro (fileCleanup.ts) y para la
 * unificación de archivos repetidos (unifyUploads.ts), así no se desincronizan.
 *  - EXACT: columnas cuyo valor ES la dirección del archivo.
 *  - TEXT: textos (HTML, mensajes, JSON) que pueden llevar la dirección adentro.
 * Los textos se revisan en memoria y no con `contains`: ese LIKE falla en
 * producción por mezcla de collations.
 * ponytail: recorre las tablas de texto completas; pasar a una tabla de
 * referencias si crecen mucho.
 */
export const EXACT_REFS = [
  ["attachment", "fileUrl"],
  ["projectAttachment", "fileUrl"],
  ["adjustmentAttachment", "fileUrl"],
  ["reviewDeliverable", "fileUrl"],
  ["reviewCheckEvidence", "fileUrl"],
  ["reviewMessageAttachment", "fileUrl"],
  ["project", "iconUrl"],
  ["user", "avatarUrl"],
  ["appSetting", "botAvatarUrl"],
] as const;

export const TEXT_REFS = [
  ["internalMessage", "body"],
  ["shareComment", "body"],
  ["reviewMessage", "body"],
  ["task", "description"],
  ["project", "description"],
  ["objective", "description"],
  ["requirement", "description"],
  ["taskStep", "description"],
  ["adjustmentItem", "description"],
  ["adjustmentItem", "note"],
  ["reviewCheck", "criteria"],
  ["reviewCheck", "note"],
  ["botMessage", "content"],
  ["notification", "message"],
  ["groupAlertItem", "message"],
  ["whatsAppQueueItem", "message"],
] as const;

type Delegate = {
  count: (args: { where: Record<string, unknown> }) => Promise<number>;
  findMany: (args: { select: Record<string, boolean> }) => Promise<Record<string, string | null>[]>;
  update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
};
// Acceso por nombre a cada tabla de la lista (verify-file-dedup.ts comprueba que cada par exista).
export const table = (model: string) => (prisma as unknown as Record<string, Delegate>)[model];

/** Cantidad de lugares que usan esta dirección (exactos + dentro de textos). */
export async function countFileReferences(fileUrl: string): Promise<number> {
  const exact = await Promise.all(EXACT_REFS.map(([model, field]) => table(model).count({ where: { [field]: fileUrl } })));
  const texts = await Promise.all(
    TEXT_REFS.map(async ([model, field]) => {
      const rows = await table(model).findMany({ select: { [field]: true } });
      return rows.filter((r) => r[field]?.includes(fileUrl)).length;
    })
  );
  return [...exact, ...texts].reduce((sum, n) => sum + n, 0);
}
