"use server";

import { prisma } from "@/lib/prisma";
import { canEditTask, resolveActor } from "@/lib/permissions";
import { projectMedia, type MediaItem } from "@/lib/projectMedia";
import { linkCredential } from "../../../../credentials/actions";
import { CREDENTIAL_MIME_TYPE, LINK_MIME_TYPE, credentialIdFromRef } from "@/lib/attachments";
import { isDuplicate } from "@/lib/duplicateNotice";
import { addAttachmentRecord, addLinkAttachment, addAdjustmentAttachment, addAdjustmentLinkAttachment, addStepAttachment, addStepLinkAttachment } from "./actions";
import type { AttachmentKind, AdjustmentAttachmentKind } from "@prisma/client";

export type { MediaItem } from "@/lib/projectMedia";

// Galería de medios: todo lo ya subido en el proyecto de la tarea y en el resto de su grupo de
// subproyectos (ver projectMedia). Requiere poder editar la tarea.
export async function listReusableMedia(taskId: string): Promise<{ ok: true; items: MediaItem[] } | { ok: false; error: string }> {
  if (!(await canEditTask(taskId))) return { ok: false, error: "No tenés permiso para editar esta tarea." };
  const actor = await resolveActor();
  if (!actor) return { ok: false, error: "No tenés permiso para editar esta tarea." };
  const { projectId } = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { projectId: true } });
  return { ok: true, items: await projectMedia(projectId, actor) };
}

// Adjunta a la tarea un elemento de la galería sin volver a subir nada. La
// URL se valida contra la galería del propio proyecto (no se confía en el cliente).
export async function reuseMedia(taskId: string, kind: AttachmentKind, url: string, userId: string) {
  try {
    const gallery = await listReusableMedia(taskId);
    if (!gallery.ok) return gallery;
    const item = gallery.items.find((i) => i.url === url);
    if (!item) return { ok: false as const, error: "Ese archivo ya no está disponible en la galería." };
    // Credencial: se agrega como insumo de la tarea (sus asignados ganan acceso y se les avisa).
    const credentialId = item.mimeType === CREDENTIAL_MIME_TYPE ? credentialIdFromRef(item.url) : null;
    if (credentialId) {
      if (kind !== "INSUMO") return { ok: false as const, error: "Las contraseñas se agregan a los insumos de la tarea." };
      const linked = await linkCredential(credentialId, { taskId });
      return linked.ok ? { ok: true as const, duplicate: Boolean(linked.duplicate) } : linked;
    }
    const r = item.mimeType === LINK_MIME_TYPE ? await addLinkAttachment(taskId, kind, item.url, item.name, userId) : await addAttachmentRecord(taskId, kind, item, userId);
    return { ok: true as const, duplicate: isDuplicate(r) };
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
    const credentialId = item.mimeType === CREDENTIAL_MIME_TYPE ? credentialIdFromRef(item.url) : null;
    if (credentialId) {
      if (kind !== "INSUMO") return { ok: false as const, error: "Las contraseñas se agregan a los insumos del ajuste." };
      const linked = await linkCredential(credentialId, { adjustmentItemId: itemId });
      return linked.ok ? { ok: true as const, duplicate: Boolean(linked.duplicate) } : linked;
    }
    const r = item.mimeType === LINK_MIME_TYPE ? await addAdjustmentLinkAttachment(itemId, kind, item.url, item.name, userId) : await addAdjustmentAttachment(itemId, kind, item, userId);
    return { ok: true as const, duplicate: isDuplicate(r) };
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
}

// Igual que reuseMedia, pero adjunta el elemento de la galería a un paso del
// checklist (queda como INSUMO de la tarea con su stepId, ver addStepAttachment).
export async function reuseMediaForStep(stepId: string, url: string) {
  try {
    const { taskId } = await prisma.taskStep.findUniqueOrThrow({ where: { id: stepId }, select: { taskId: true } });
    const gallery = await listReusableMedia(taskId);
    if (!gallery.ok) return gallery;
    const item = gallery.items.find((i) => i.url === url);
    if (!item) return { ok: false as const, error: "Ese archivo ya no está disponible en la galería." };
    const credentialId = item.mimeType === CREDENTIAL_MIME_TYPE ? credentialIdFromRef(item.url) : null;
    if (credentialId) {
      const linked = await linkCredential(credentialId, { stepId });
      return linked.ok ? { ok: true as const, duplicate: Boolean(linked.duplicate) } : linked;
    }
    const r = item.mimeType === LINK_MIME_TYPE ? await addStepLinkAttachment(stepId, item.url, item.name) : await addStepAttachment(stepId, item);
    return { ok: true as const, duplicate: isDuplicate(r) };
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
}
