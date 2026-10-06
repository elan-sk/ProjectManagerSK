import { prisma } from "@/lib/prisma";
import type { AdjustmentAttachmentKind, AttachmentKind } from "@prisma/client";

/**
 * Spec 001 (RF-3, RF-4): un mismo archivo o link no se repite dentro de una
 * misma SECCIÓN (Insumos de la tarea A, Antes del cambio 2, Entregables de la
 * ronda 1…). En secciones distintas sí se permite. Las subidas ya llegan con
 * nombre por contenido (uploadFile.ts), así que comparar la URL alcanza; en los
 * links se ignoran los espacios de los extremos.
 */
export type Section =
  | { taskId: string; kind: AttachmentKind }
  | { stepId: string }
  | { adjustmentItemId: string; kind: AdjustmentAttachmentKind }
  | { reviewRoundId: string }
  | { reviewCheckId: string }
  | { projectId: string; links?: boolean };

export { ALREADY_LOADED, alreadyLoadedMessage } from "@/lib/duplicateNotice";
/** Resultado de una acción de adjuntar cuando el archivo ya estaba en la sección (aviso, no error). */
export const DUPLICATE = { duplicate: true as const };


export async function inSection(section: Section, url: string): Promise<boolean> {
  const fileUrl = url.trim();
  if ("stepId" in section) return (await prisma.attachment.count({ where: { stepId: section.stepId, fileUrl } })) > 0;
  if ("taskId" in section) return (await prisma.attachment.count({ where: { taskId: section.taskId, kind: section.kind, fileUrl } })) > 0;
  if ("adjustmentItemId" in section)
    return (await prisma.adjustmentAttachment.count({ where: { adjustmentItemId: section.adjustmentItemId, kind: section.kind, fileUrl } })) > 0;
  if ("reviewRoundId" in section) return (await prisma.reviewDeliverable.count({ where: { reviewRoundId: section.reviewRoundId, fileUrl } })) > 0;
  if ("reviewCheckId" in section) return (await prisma.reviewCheckEvidence.count({ where: { reviewCheckId: section.reviewCheckId, fileUrl } })) > 0;
  if (section.links) return (await prisma.projectLink.count({ where: { projectId: section.projectId, url: fileUrl } })) > 0;
  return (await prisma.projectAttachment.count({ where: { projectId: section.projectId, fileUrl } })) > 0;
}

/** Separa una carga múltiple en lo nuevo y lo que ya estaba en la sección (repetidos dentro de la misma carga incluidos). */
export async function splitNew<T extends { url: string; name: string }>(section: Section, files: T[]): Promise<{ fresh: T[]; skipped: string[] }> {
  const fresh: T[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    const key = f.url.trim();
    if (seen.has(key) || (await inSection(section, key))) skipped.push(f.name);
    else {
      seen.add(key);
      fresh.push(f);
    }
  }
  return { fresh, skipped };
}
