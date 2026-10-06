import { prisma } from "@/lib/prisma";
import { linkKey } from "@/lib/attachments";
import type { AdjustmentAttachmentKind, AttachmentKind } from "@prisma/client";

/**
 * Spec 001 (RF-3, RF-4): un mismo archivo o link no se repite dentro de una
 * misma SECCIÓN (Insumos de la tarea A, Antes del cambio 2, Entregables de la
 * ronda 1…). En secciones distintas sí se permite. Las subidas ya llegan con
 * nombre por contenido (uploadFile.ts); los links se comparan con linkKey.
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


/** Direcciones ya cargadas en la sección. */
async function sectionUrls(section: Section): Promise<string[]> {
  if ("stepId" in section) return (await prisma.attachment.findMany({ where: { stepId: section.stepId }, select: { fileUrl: true } })).map((r) => r.fileUrl);
  if ("taskId" in section) return (await prisma.attachment.findMany({ where: { taskId: section.taskId, kind: section.kind }, select: { fileUrl: true } })).map((r) => r.fileUrl);
  if ("adjustmentItemId" in section)
    return (await prisma.adjustmentAttachment.findMany({ where: { adjustmentItemId: section.adjustmentItemId, kind: section.kind }, select: { fileUrl: true } })).map((r) => r.fileUrl);
  if ("reviewRoundId" in section) return (await prisma.reviewDeliverable.findMany({ where: { reviewRoundId: section.reviewRoundId }, select: { fileUrl: true } })).map((r) => r.fileUrl);
  if ("reviewCheckId" in section) return (await prisma.reviewCheckEvidence.findMany({ where: { reviewCheckId: section.reviewCheckId }, select: { fileUrl: true } })).map((r) => r.fileUrl);
  if (section.links) return (await prisma.projectLink.findMany({ where: { projectId: section.projectId }, select: { url: true } })).map((r) => r.url);
  return (await prisma.projectAttachment.findMany({ where: { projectId: section.projectId }, select: { fileUrl: true } })).map((r) => r.fileUrl);
}

/** true si la sección ya tiene ese archivo o link (los links se comparan con linkKey: mismo link aunque cambie el nombre o un detalle de la dirección). */
export async function inSection(section: Section, url: string): Promise<boolean> {
  const key = linkKey(url);
  return (await sectionUrls(section)).some((u) => linkKey(u) === key);
}

/** Separa una carga múltiple en lo nuevo y lo que ya estaba en la sección (repetidos dentro de la misma carga incluidos). */
export async function splitNew<T extends { url: string; name: string }>(section: Section, files: T[]): Promise<{ fresh: T[]; skipped: string[] }> {
  const fresh: T[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    const key = linkKey(f.url);
    if (seen.has(key) || (await inSection(section, f.url))) skipped.push(f.name);
    else {
      seen.add(key);
      fresh.push(f);
    }
  }
  return { fresh, skipped };
}
