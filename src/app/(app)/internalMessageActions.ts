"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { COMMENT_MAX_LENGTH, commentEditError, commentAttachments, commentMentionIds } from "@/lib/commentBody";
import { notifyInternalComment } from "@/lib/notifications";
import { mimeFromFileName } from "@/lib/uploadFile";
import { LINK_MIME_TYPE } from "@/lib/attachments";

async function allowed(projectId: string, taskId?: string | null) {
  const session = await auth();
  if (!session?.user) throw new Error("No autenticado.");
  const id = session.user.id;
  if (session.user.role === "ADMIN") return id;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { pmId: true } });
  if (project?.pmId === id) return id;
  const where = taskId ? { taskId } : { task: { projectId } };
  const member = await prisma.task.findFirst({ where: { ...where, OR: [{ assignees: { some: { userId: id } } }, { reviewers: { some: { userId: id } } }] } });
  if (!member) throw new Error("No tenés acceso a esta conversación.");
  return id;
}

// Los archivos, imágenes y enlaces de un comentario también quedan como
// Insumos de la tarea (o como archivos/enlaces del proyecto, si el comentario
// es del proyecto) — así aparecen en la pestaña de archivos y en su filtro.
// Sin duplicar: si esa ruta ya está registrada, no se vuelve a crear.
async function syncCommentAttachments(projectId: string, taskId: string | null, uploadedById: string, body: string) {
  for (const a of commentAttachments(body)) {
    const mimeType = a.kind === "link" ? LINK_MIME_TYPE : mimeFromFileName(a.name || a.url);
    if (taskId) {
      const exists = await prisma.attachment.findFirst({ where: { taskId, fileUrl: a.url }, select: { id: true } });
      if (!exists) await prisma.attachment.create({ data: { taskId, kind: "INSUMO", fileUrl: a.url, fileName: a.name, mimeType, uploadedById } });
    } else if (a.kind === "link") {
      const exists = await prisma.projectLink.findFirst({ where: { projectId, url: a.url }, select: { id: true } });
      if (!exists) await prisma.projectLink.create({ data: { projectId, title: a.name, url: a.url } });
    } else {
      const exists = await prisma.projectAttachment.findFirst({ where: { projectId, fileUrl: a.url }, select: { id: true } });
      if (!exists) await prisma.projectAttachment.create({ data: { projectId, fileUrl: a.url, fileName: a.name, mimeType, uploadedById } });
    }
  }
}

// Solo cuentan las menciones a usuarios activos que existen de verdad.
async function validMentionIds(body: string, authorId: string) {
  const ids = commentMentionIds(body).filter((id) => id !== authorId);
  if (ids.length === 0) return [];
  const users = await prisma.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true } });
  return users.map((u) => u.id);
}

export async function postInternalMessage(projectId: string, taskId: string | null, body: string) {
  const authorId = await allowed(projectId, taskId);
  const text = body.trim();
  if (!text || text.length > COMMENT_MAX_LENGTH) return { ok: false, error: `El comentario debe tener entre 1 y ${COMMENT_MAX_LENGTH} caracteres.` };
  const mentionIds = await validMentionIds(text, authorId);
  const message = await prisma.internalMessage.create({
    data: {
      projectId,
      taskId,
      authorId,
      body: text,
      reads: { create: { userId: authorId } },
      mentions: { create: mentionIds.map((userId) => ({ userId })) },
    },
  });
  await syncCommentAttachments(projectId, taskId, authorId, text);
  // El aviso por WhatsApp es de mejor esfuerzo: si falla, el comentario ya quedó.
  await notifyInternalComment(message.id).catch((err) => console.error("[comentarios] no se pudo notificar", err));
  revalidatePath(taskId ? `/projects/${projectId}/tasks/${taskId}` : `/projects/${projectId}`);
  return { ok: true };
}

// Editar/eliminar: solo el autor y solo durante los primeros 5 minutos
// (commentEditError) — se valida acá, en el servidor, no solo escondiendo los
// botones en la interfaz.
async function ownMessageInWindow(messageId: string) {
  const session = await auth();
  if (!session?.user) return { error: "Tu sesión venció. Volvé a entrar." } as const;
  const message = await prisma.internalMessage.findUnique({ where: { id: messageId }, select: { authorId: true, createdAt: true, projectId: true, taskId: true, mentions: { select: { userId: true } } } });
  if (!message) return { error: "Ese comentario ya no existe." } as const;
  const blocked = commentEditError(message.authorId, session.user.id, message.createdAt, Date.now());
  if (blocked) return { error: blocked } as const;
  return { message } as const;
}

const messagePath = (m: { projectId: string; taskId: string | null }) => (m.taskId ? `/projects/${m.projectId}/tasks/${m.taskId}` : `/projects/${m.projectId}`);

export async function editInternalMessage(messageId: string, body: string) {
  const found = await ownMessageInWindow(messageId);
  if ("error" in found) return { ok: false as const, error: found.error };
  const text = body.trim();
  if (!text || text.length > COMMENT_MAX_LENGTH) return { ok: false as const, error: `El comentario debe tener entre 1 y ${COMMENT_MAX_LENGTH} caracteres.` };
  const mentionIds = await validMentionIds(text, found.message.authorId);
  const before = new Set(found.message.mentions.map((m) => m.userId));
  await prisma.$transaction([
    prisma.internalMessageMention.deleteMany({ where: { messageId } }),
    prisma.internalMessageMention.createMany({ data: mentionIds.map((userId) => ({ messageId, userId })) }),
    prisma.internalMessage.update({ where: { id: messageId }, data: { body: text, editedAt: new Date() } }),
  ]);
  await syncCommentAttachments(found.message.projectId, found.message.taskId, found.message.authorId, text);
  // Al editar solo se avisa a quien se mencionó por primera vez.
  const added = mentionIds.filter((id) => !before.has(id));
  if (added.length > 0) await notifyInternalComment(messageId, { onlyMentionIds: added }).catch((err) => console.error("[comentarios] no se pudo notificar", err));
  revalidatePath(messagePath(found.message));
  return { ok: true as const };
}

export async function deleteInternalMessage(messageId: string) {
  const found = await ownMessageInWindow(messageId);
  if ("error" in found) return { ok: false as const, error: found.error };
  await prisma.internalMessage.delete({ where: { id: messageId } });
  revalidatePath(messagePath(found.message));
  return { ok: true as const };
}

export async function markInternalMessageRead(messageId: string) {
  const session = await auth();
  if (!session?.user) return;
  await prisma.internalMessageRead.upsert({ where: { messageId_userId: { messageId, userId: session.user.id } }, create: { messageId, userId: session.user.id }, update: {} });
}
