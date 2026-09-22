"use server";

import { prisma } from "@/lib/prisma";
import { canEditTask } from "@/lib/permissions";
import { LINK_MIME_TYPE } from "@/lib/attachments";
import { addAttachmentRecord, addLinkAttachment, addAdjustmentAttachment, addAdjustmentLinkAttachment } from "./actions";
import type { AttachmentKind, AdjustmentAttachmentKind } from "@prisma/client";

export type MediaItem = { url: string; name: string; mimeType: string };

// Galería de medios: todo lo ya subido (archivos y links) en el PROYECTO de la
// tarea — adjuntos de sus tareas, archivos y enlaces de Definición — sin
// repetir el mismo archivo físico.
export async function listReusableMedia(taskId: string): Promise<{ ok: true; items: MediaItem[] } | { ok: false; error: string }> {
  if (!(await canEditTask(taskId))) return { ok: false, error: "No tenés permiso para editar esta tarea." };
  const { projectId } = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { projectId: true } });
  const [attachments, projectAttachments, links] = await Promise.all([
    prisma.attachment.findMany({ where: { task: { projectId } }, select: { fileUrl: true, fileName: true, mimeType: true }, orderBy: { uploadedAt: "desc" } }),
    prisma.projectAttachment.findMany({ where: { projectId }, select: { fileUrl: true, fileName: true, mimeType: true }, orderBy: { uploadedAt: "desc" } }),
    prisma.projectLink.findMany({ where: { projectId }, select: { url: true, title: true } }),
  ]);
  const seen = new Set<string>();
  const items: MediaItem[] = [];
  for (const a of [...attachments, ...projectAttachments, ...links.map((l) => ({ fileUrl: l.url, fileName: l.title, mimeType: LINK_MIME_TYPE }))]) {
    if (seen.has(a.fileUrl)) continue;
    seen.add(a.fileUrl);
    items.push({ url: a.fileUrl, name: a.fileName, mimeType: a.mimeType });
  }
  return { ok: true, items };
}

// Adjunta a la tarea un elemento de la galería sin volver a subir nada. La
// URL se valida contra la galería del propio proyecto (no se confía en el cliente).
export async function reuseMedia(taskId: string, kind: AttachmentKind, url: string, userId: string) {
  try {
    const gallery = await listReusableMedia(taskId);
    if (!gallery.ok) return gallery;
    const item = gallery.items.find((i) => i.url === url);
    if (!item) return { ok: false as const, error: "Ese archivo ya no está disponible en la galería." };
    if (item.mimeType === LINK_MIME_TYPE) await addLinkAttachment(taskId, kind, item.url, item.name, userId);
    else await addAttachmentRecord(taskId, kind, item, userId);
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
}

// Igual que reuseMedia, pero para adjuntar el elemento de la galería a un
// AdjustmentItem puntual (ej. Insumos de un ajuste) en vez de a la tarea.
export async function reuseMediaForAdjustment(itemId: string, kind: AdjustmentAttachmentKind, url: string, userId: string) {
  try {
    const { taskId } = await prisma.adjustmentItem.findUniqueOrThrow({ where: { id: itemId }, select: { taskId: true } });
    const gallery = await listReusableMedia(taskId);
    if (!gallery.ok) return gallery;
    const item = gallery.items.find((i) => i.url === url);
    if (!item) return { ok: false as const, error: "Ese archivo ya no está disponible en la galería." };
    if (item.mimeType === LINK_MIME_TYPE) await addAdjustmentLinkAttachment(itemId, kind, item.url, item.name, userId);
    else await addAdjustmentAttachment(itemId, kind, item, userId);
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
}
