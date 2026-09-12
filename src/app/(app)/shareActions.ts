"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireProjectAdmin } from "@/lib/permissions";
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

export async function createTaskShareLink(taskId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  let user;
  try {
    user = await requireProjectAdmin(task.projectId);
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
  const link = await createShareLink("TASK", taskId, user.id);
  revalidatePath(`/projects/${task.projectId}/tasks/${taskId}`);
  return { ok: true as const, token: link.token };
}

export async function revokeTaskShareLink(taskId: string, linkId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  try {
    await requireProjectAdmin(task.projectId);
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
  await revokeShareLink(linkId);
  revalidatePath(`/projects/${task.projectId}/tasks/${taskId}`);
  return { ok: true as const };
}
