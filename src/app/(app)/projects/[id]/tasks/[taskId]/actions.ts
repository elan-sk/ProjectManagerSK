"use server";

import { revalidatePath } from "next/cache";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createCalendarEvent } from "@/lib/googleCalendar";
import { requireProjectAdmin } from "@/lib/permissions";
import { notifyAssignment } from "@/lib/notifications";
import { propagateToSuccessors } from "../../actions";
import type { AttachmentKind, DependencyType } from "@prisma/client";

export async function addStep(taskId: string, formData: FormData) {
  const description = z.string().min(1).parse(formData.get("description"));
  const count = await prisma.taskStep.count({ where: { taskId } });
  await prisma.taskStep.create({ data: { taskId, description, order: count } });
  await revalidateTask(taskId);
}

export async function toggleStep(stepId: string, done: boolean) {
  const step = await prisma.taskStep.update({ where: { id: stepId }, data: { done } });
  await revalidateTask(step.taskId);
}

export async function addAttachmentRecord(
  taskId: string,
  kind: AttachmentKind,
  file: { url: string; name: string; mimeType: string },
  uploadedById: string
) {
  await prisma.attachment.create({
    data: {
      taskId,
      kind,
      fileUrl: file.url,
      fileName: file.name,
      mimeType: file.mimeType,
      uploadedById,
    },
  });
  await revalidateTask(taskId);
}

export async function removeAttachment(attachmentId: string) {
  const attachment = await prisma.attachment.delete({ where: { id: attachmentId } });
  await unlink(path.join(process.cwd(), "public", attachment.fileUrl)).catch(() => {});
  await revalidateTask(attachment.taskId);
}

export async function setDependency(taskId: string, formData: FormData) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: { project: true } });
  await requireProjectAdmin(task.projectId);

  const predecessorId = formData.get("predecessorId") as string;
  if (!predecessorId || predecessorId === taskId) return;
  const type = (formData.get("type") as DependencyType) || "FINISH_TO_START";

  // Al crear el vínculo, la tarea sucesora se resincroniza de una vez contra
  // su nueva predecesora (y en cadena, sus propias sucesoras) — así el
  // vínculo nace consistente en el Gantt, sin esperar al próximo arrastre.
  await prisma.$transaction(async (tx) => {
    await tx.taskDependency.upsert({
      where: { predecessorId_successorId: { predecessorId, successorId: taskId } },
      update: { type },
      create: { predecessorId, successorId: taskId, type },
    });
    await propagateToSuccessors(tx, task.project.countryCode, predecessorId);
  });
  await revalidateTask(taskId);
  revalidatePath(`/projects/${task.projectId}`);
}

export async function removeDependency(dependencyId: string, taskId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  await requireProjectAdmin(task.projectId);

  await prisma.taskDependency.delete({ where: { id: dependencyId } });
  await revalidateTask(taskId);
  revalidatePath(`/projects/${task.projectId}`);
}

export async function setTaskAssignees(taskId: string, formData: FormData) {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { assignees: true },
  });
  try {
    await requireProjectAdmin(task.projectId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const assigneeIds = formData.getAll("assigneeIds") as string[];
  const currentIds = task.assignees.map((a) => a.userId);
  const newlyAdded = assigneeIds.filter((id) => !currentIds.includes(id));

  await prisma.$transaction([
    prisma.taskAssignee.deleteMany({ where: { taskId } }),
    prisma.taskAssignee.createMany({ data: assigneeIds.map((userId) => ({ taskId, userId })) }),
  ]);
  await notifyAssignment(taskId, newlyAdded);

  await revalidateTask(taskId);
  revalidatePath(`/projects/${task.projectId}`);
  return { ok: true };
}

export async function updateTaskTitle(taskId: string, title: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  try {
    await requireProjectAdmin(task.projectId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const parsed = z.string().min(1).safeParse(title);
  if (!parsed.success) return { ok: false, error: "El título no puede quedar vacío." };

  await prisma.task.update({ where: { id: taskId }, data: { title: parsed.data } });
  await revalidateTask(taskId);
  revalidatePath(`/projects/${task.projectId}`);
  return { ok: true };
}

export async function updateTaskType(taskId: string, type: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  try {
    await requireProjectAdmin(task.projectId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const parsed = z.enum(["SIMPLE", "CHECKLIST", "MILESTONE", "MEETING", "QA", "ADJUSTMENT"]).safeParse(type);
  if (!parsed.success) return { ok: false, error: "Tipo inválido." };

  await prisma.task.update({ where: { id: taskId }, data: { type: parsed.data } });
  await revalidateTask(taskId);
  revalidatePath(`/projects/${task.projectId}`);
  return { ok: true };
}

export async function updateTaskPhase(taskId: string, phaseId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  try {
    await requireProjectAdmin(task.projectId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const phase = await prisma.phase.findUnique({ where: { id: phaseId } });
  if (!phase || phase.projectId !== task.projectId) return { ok: false, error: "Fase inválida." };

  await prisma.task.update({ where: { id: taskId }, data: { phaseId } });
  await revalidateTask(taskId);
  revalidatePath(`/projects/${task.projectId}`);
  return { ok: true };
}

export async function updateTaskDescription(taskId: string, formData: FormData) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  try {
    await requireProjectAdmin(task.projectId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const raw = formData.get("description");
  const description = typeof raw === "string" && raw.trim() !== "" ? raw : null;

  await prisma.task.update({ where: { id: taskId }, data: { description } });
  await revalidateTask(taskId);
  revalidatePath(`/projects/${task.projectId}`);
  return { ok: true };
}

export async function deleteTask(taskId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  try {
    await requireProjectAdmin(task.projectId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  await prisma.task.delete({ where: { id: taskId } });
  revalidatePath(`/projects/${task.projectId}`);
  return { ok: true };
}

export async function syncTaskToGoogleCalendar(taskId: string, userId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  try {
    await createCalendarEvent(userId, {
      summary: task.title,
      description: `ProjectManagerSK — ${task.type}`,
      start: task.plannedStart,
      end: task.plannedEnd,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function revalidateTask(taskId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  revalidatePath(`/projects/${task.projectId}/tasks/${taskId}`);
}
