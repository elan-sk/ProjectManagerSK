"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

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

export async function markInternalMessageRead(messageId: string) {
  const session = await auth();
  if (!session?.user) return;
  await prisma.internalMessageRead.upsert({ where: { messageId_userId: { messageId, userId: session.user.id } }, create: { messageId, userId: session.user.id }, update: {} });
}
