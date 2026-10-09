"use server";

import { prisma } from "@/lib/prisma";
import { canEditTask, resolveActor } from "@/lib/permissions";
import { credentialVisibleWhere } from "@/lib/credentials";
import { linkCredential } from "../../../../credentials/actions";
import { CREDENTIAL_MIME_TYPE, LINK_MIME_TYPE, credentialIdFromRef, credentialRef, linkKey, repoLinkName } from "@/lib/attachments";
import { isDuplicate } from "@/lib/duplicateNotice";
import { addAttachmentRecord, addLinkAttachment, addAdjustmentAttachment, addAdjustmentLinkAttachment, addStepAttachment, addStepLinkAttachment } from "./actions";
import type { AttachmentKind, AdjustmentAttachmentKind } from "@prisma/client";

export type MediaItem = { url: string; name: string; mimeType: string };

// Galería de medios: todo lo ya subido (archivos y links) en el PROYECTO de la
// tarea — adjuntos de sus tareas, archivos y enlaces de Definición — sin
// repetir el mismo archivo físico.
export async function listReusableMedia(taskId: string): Promise<{ ok: true; items: MediaItem[] } | { ok: false; error: string }> {
  if (!(await canEditTask(taskId))) return { ok: false, error: "No tenés permiso para editar esta tarea." };
  const { projectId } = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { projectId: true } });
  const fileSelect = { fileUrl: true, fileName: true, mimeType: true, uploadedAt: true } as const;
  // Spec 001 (RF-7): también los archivos de Ajustes y de las rondas de Prueba/Aceptación.
  const [attachments, projectAttachments, links, adjustmentFiles, deliverables, evidence, project] = await Promise.all([
    prisma.attachment.findMany({ where: { task: { projectId } }, select: fileSelect }),
    prisma.projectAttachment.findMany({ where: { projectId }, select: fileSelect }),
    prisma.projectLink.findMany({ where: { projectId }, select: { url: true, title: true, createdAt: true } }),
    prisma.adjustmentAttachment.findMany({ where: { adjustmentItem: { task: { projectId } } }, select: fileSelect }),
    prisma.reviewDeliverable.findMany({ where: { reviewRound: { task: { projectId } } }, select: fileSelect }),
    prisma.reviewCheckEvidence.findMany({ where: { reviewCheck: { reviewRound: { task: { projectId } } } }, select: fileSelect }),
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { repoUrl: true, createdAt: true, repos: { select: { url: true, createdAt: true } } } }),
  ]);
  // Repositorios (principal + adicionales), con el mismo nombre que en la vista Archivos.
  const repos = [...(project.repoUrl ? [{ url: project.repoUrl, createdAt: project.createdAt }] : []), ...project.repos].filter((r, i, all) => all.findIndex((x) => x.url === r.url) === i);
  // Siempre de lo más reciente a lo más antiguo, mezclando archivos y links; un archivo
  // usado en varios lugares aparece una vez, en la posición de su uso más reciente.
  // Credenciales del proyecto que esta persona puede ver (nunca las ajenas): se agregan como insumo.
  const actor = await resolveActor();
  const credentials = actor
    ? await prisma.credential.findMany({ where: { projectId, ...credentialVisibleWhere(actor) }, select: { id: true, name: true, createdAt: true } })
    : [];
  const all = [
    ...attachments,
    ...projectAttachments,
    ...adjustmentFiles,
    ...deliverables,
    ...evidence,
    ...links.map((l) => ({ fileUrl: l.url, fileName: l.title, mimeType: LINK_MIME_TYPE, uploadedAt: l.createdAt })),
    ...repos.map((r, i) => ({ fileUrl: r.url, fileName: repoLinkName(r.url, i, repos.length), mimeType: LINK_MIME_TYPE, uploadedAt: r.createdAt })),
    ...credentials.map((c) => ({ fileUrl: credentialRef(c.id), fileName: c.name, mimeType: CREDENTIAL_MIME_TYPE, uploadedAt: c.createdAt })),
  ]
    .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  const seen = new Set<string>();
  const items: MediaItem[] = [];
  for (const a of all) {
    if (seen.has(linkKey(a.fileUrl))) continue;
    seen.add(linkKey(a.fileUrl));
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
