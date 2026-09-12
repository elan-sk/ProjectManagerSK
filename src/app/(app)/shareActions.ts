"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectAdmin, canEditTask } from "@/lib/permissions";
import { createShareLink, revokeShareLink } from "@/lib/shareLinks";

export async function createProjectShareLink(projectId: string) {
  let user;
  try {
    user = await requireProjectAdmin(projectId);
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
  const link = await createShareLink("PROJECT", projectId, user.id);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true as const, token: link.token };
}

export async function revokeProjectShareLink(projectId: string, linkId: string) {
  try {
    await requireProjectAdmin(projectId);
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
  await revokeShareLink(linkId);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true as const };
}

// A diferencia de compartir un PROYECTO entero (siempre solo PM/admin,
// arriba), compartir UNA tarea puntual la puede hacer cualquiera que ya
// pueda editarla — un asignado, el PM del proyecto, o un admin — mismo
// criterio que canEditTask ya usa para el resto de la tarea (checklist,
// insumos, estado). Es "su" tarea en ese sentido, no la definición del
// proyecto.
export async function createTaskShareLink(taskId: string) {
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "Necesitás iniciar sesión para hacer esto." };
  if (!(await canEditTask(taskId))) {
    return { ok: false as const, error: "Solo un asignado a esta tarea, el PM del proyecto o un administrador pueden compartirla." };
  }
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { projectId: true } });
  const link = await createShareLink("TASK", taskId, session.user.id);
  revalidatePath(`/projects/${task.projectId}/tasks/${taskId}`);
  return { ok: true as const, token: link.token };
}

export async function revokeTaskShareLink(taskId: string, linkId: string) {
  if (!(await canEditTask(taskId))) {
    return { ok: false as const, error: "Solo un asignado a esta tarea, el PM del proyecto o un administrador pueden dejar de compartirla." };
  }
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { projectId: true } });
  await revokeShareLink(linkId);
  revalidatePath(`/projects/${task.projectId}/tasks/${taskId}`);
  return { ok: true as const };
}
