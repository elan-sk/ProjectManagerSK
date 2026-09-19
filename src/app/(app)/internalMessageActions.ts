"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { COMMENT_MAX_LENGTH, commentEditError } from "@/lib/commentBody";

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

export async function postInternalMessage(projectId: string, taskId: string | null, body: string) {
  const authorId = await allowed(projectId, taskId);
  const text = body.trim();
  if (!text || text.length > 3000) return { ok: false, error: "El comentario debe tener entre 1 y 3000 caracteres." };
  await prisma.internalMessage.create({ data: { projectId, taskId, authorId, body: text, reads: { create: { userId: authorId } } } });
  revalidatePath(taskId ? `/projects/${projectId}/tasks/${taskId}` : `/projects/${projectId}`);
  return { ok: true };
}

// Editar/eliminar: solo el autor y solo durante los primeros 5 minutos
// (commentEditError) — se valida acá, en el servidor, no solo escondiendo los
// botones en la interfaz.
async function ownMessageInWindow(messageId: string) {
  const session = await auth();
  if (!session?.user) return { error: "Tu sesión venció. Volvé a entrar." } as const;
  const message = await prisma.internalMessage.findUnique({ where: { id: messageId }, select: { authorId: true, createdAt: true, projectId: true, taskId: true } });
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
  await prisma.internalMessage.update({ where: { id: messageId }, data: { body: text } });
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
