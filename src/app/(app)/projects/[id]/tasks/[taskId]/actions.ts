"use server";

import { revalidatePath } from "next/cache";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createCalendarEvent } from "@/lib/googleCalendar";
import { requireProjectAdmin, canEditTask } from "@/lib/permissions";
import { notifyAssignment } from "@/lib/notifications";
import { LINK_MIME_TYPE } from "@/lib/attachments";
import { bogotaLocalToUTC } from "@/lib/workingHours";
import { propagateToSuccessors } from "../../actions";
import type { AttachmentKind, AdjustmentAttachmentKind, DependencyType } from "@prisma/client";

export async function addStep(taskId: string, formData: FormData) {
  if (!(await canEditTask(taskId))) {
    throw new Error("No tenés permiso para editar esta tarea.");
  }
  const description = z.string().min(1).parse(formData.get("description"));
  const count = await prisma.taskStep.count({ where: { taskId } });
  await prisma.taskStep.create({ data: { taskId, description, order: count } });
  await revalidateTask(taskId);
}

export async function toggleStep(stepId: string, done: boolean) {
  const step = await prisma.taskStep.findUniqueOrThrow({ where: { id: stepId } });
  if (!(await canEditTask(step.taskId))) {
    throw new Error("No tenés permiso para editar esta tarea.");
  }
  await prisma.taskStep.update({ where: { id: stepId }, data: { done } });
  await revalidateTask(step.taskId);
}

export async function addAttachmentRecord(
  taskId: string,
  kind: AttachmentKind,
  file: { url: string; name: string; mimeType: string },
  uploadedById: string
) {
  if (!(await canEditTask(taskId))) {
    throw new Error("No tenés permiso para editar esta tarea.");
  }
  await assertCanAddAttachment(taskId, kind);
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

// Una tarea ya completada no admite más evidencia — la evidencia prueba lo
// hecho, y eso se sube ANTES de cerrarla. Los insumos sí siguen abiertos
// (documentación de apoyo puede sumarse en cualquier momento).
async function assertCanAddAttachment(taskId: string, kind: AttachmentKind) {
  if (kind !== "RESULTADO") return;
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { status: true } });
  if (task.status === "COMPLETED") {
    throw new Error("La tarea ya está completada — no se puede subir más evidencia.");
  }
}

export async function removeAttachment(attachmentId: string) {
  const attachment = await prisma.attachment.findUniqueOrThrow({
    where: { id: attachmentId },
    include: { task: true },
  });
  await requireProjectAdmin(attachment.task.projectId);

  await prisma.attachment.delete({ where: { id: attachmentId } });
  if (attachment.mimeType !== LINK_MIME_TYPE) {
    await unlink(path.join(process.cwd(), "public", attachment.fileUrl)).catch(() => {});
  }
  await revalidateTask(attachment.taskId);
}

export async function addLinkAttachment(
  taskId: string,
  kind: AttachmentKind,
  url: string,
  name: string,
  uploadedById: string
) {
  if (!(await canEditTask(taskId))) {
    throw new Error("No tenés permiso para editar esta tarea.");
  }
  await assertCanAddAttachment(taskId, kind);
  const parsedUrlResult = z.string().trim().url().safeParse(url);
  if (!parsedUrlResult.success) {
    throw new Error("Ese link no parece válido — revisá que sea una dirección web completa (con https://).");
  }
  const parsedNameResult = z.string().trim().min(1).safeParse(name);
  if (!parsedNameResult.success) {
    throw new Error("Ponele un nombre al link.");
  }
  const parsedUrl = parsedUrlResult.data;
  const parsedName = parsedNameResult.data;
  await prisma.attachment.create({
    data: {
      taskId,
      kind,
      fileUrl: parsedUrl,
      fileName: parsedName,
      mimeType: LINK_MIME_TYPE,
      uploadedById,
    },
  });
  await revalidateTask(taskId);
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
  if (!(await canEditTask(taskId))) {
    return { ok: false, error: "No tenés permiso para editar esta tarea." };
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
  if (!(await canEditTask(taskId))) {
    return { ok: false, error: "No tenés permiso para editar esta tarea." };
  }

  const parsed = z.string().min(1).safeParse(title);
  if (!parsed.success) return { ok: false, error: "El título no puede quedar vacío." };

  await prisma.task.update({ where: { id: taskId }, data: { title: parsed.data } });
  await revalidateTask(taskId);
  revalidatePath(`/projects/${task.projectId}`);
  return { ok: true };
}

// Punto 2.3: cambiar el tipo de tarea es solo del PM/admin — a diferencia
// del resto de los campos, no lo puede tocar un asignado (canEditTask).
export async function updateTaskType(taskId: string, type: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  try {
    await requireProjectAdmin(task.projectId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const parsed = z.enum(["SIMPLE", "MILESTONE", "QA", "ADJUSTMENT"]).safeParse(type);
  if (!parsed.success) return { ok: false, error: "Tipo inválido." };

  await prisma.task.update({ where: { id: taskId }, data: { type: parsed.data } });
  await revalidateTask(taskId);
  revalidatePath(`/projects/${task.projectId}`);
  return { ok: true };
}

export async function updateTaskPhase(taskId: string, phaseId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  if (!(await canEditTask(taskId))) {
    return { ok: false, error: "No tenés permiso para editar esta tarea." };
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
  if (!(await canEditTask(taskId))) {
    return { ok: false, error: "No tenés permiso para editar esta tarea." };
  }

  const raw = formData.get("description");
  const description = typeof raw === "string" && raw.trim() !== "" ? raw : null;

  await prisma.task.update({ where: { id: taskId }, data: { description } });
  await revalidateTask(taskId);
  revalidatePath(`/projects/${task.projectId}`);
  return { ok: true };
}

// Punto 2.4: cualquier tarea puede tener un link de reunión (Meet/Zoom/Teams).
export async function updateTaskMeetingUrl(taskId: string, formData: FormData) {
  if (!(await canEditTask(taskId))) {
    return { ok: false, error: "No tenés permiso para editar esta tarea." };
  }

  const raw = formData.get("meetingUrl");
  const rawAt = formData.get("meetingAt");

  if (typeof raw !== "string" || raw.trim() === "") {
    await prisma.task.update({ where: { id: taskId }, data: { meetingUrl: null, meetingAt: null, meetingReminderSentAt: null } });
    await revalidateTask(taskId);
    return { ok: true };
  }

  const parsed = z.string().trim().url().safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Ese link no parece válido — revisá que sea una dirección web completa (con https://)." };

  const meetingAt = typeof rawAt === "string" && rawAt.trim() !== "" ? bogotaLocalToUTC(rawAt) : null;
  if (typeof rawAt === "string" && rawAt.trim() !== "" && !meetingAt) {
    return { ok: false, error: "La fecha/hora de la reunión no es válida." };
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { meetingUrl: parsed.data, meetingAt, meetingReminderSentAt: null },
  });
  await revalidateTask(taskId);
  return { ok: true };
}

// Punto 2.5: "cambios solicitados" de una tarea tipo Ajuste — cada uno con
// su Antes/Después (o una nota cuando no aplica). El estado de cada cambio
// se deriva solo de esto, nunca de un checkbox manual.
export async function addAdjustmentItem(taskId: string, formData: FormData) {
  if (!(await canEditTask(taskId))) {
    return { ok: false, error: "No tenés permiso para editar esta tarea." };
  }
  const parsed = z.string().trim().min(1).safeParse(formData.get("description"));
  if (!parsed.success) return { ok: false, error: "Describí el cambio solicitado." };
  const count = await prisma.adjustmentItem.count({ where: { taskId } });
  await prisma.adjustmentItem.create({ data: { taskId, description: parsed.data, order: count } });
  await revalidateTask(taskId);
  return { ok: true };
}

export async function removeAdjustmentItem(itemId: string) {
  const item = await prisma.adjustmentItem.findUniqueOrThrow({ where: { id: itemId }, include: { task: true } });
  await requireProjectAdmin(item.task.projectId);
  await prisma.adjustmentItem.delete({ where: { id: itemId } });
  await revalidateTask(item.taskId);
}

export async function setAdjustmentNote(itemId: string, note: string) {
  const item = await prisma.adjustmentItem.findUniqueOrThrow({ where: { id: itemId } });
  if (!(await canEditTask(item.taskId))) {
    return { ok: false, error: "No tenés permiso para editar esta tarea." };
  }
  await prisma.adjustmentItem.update({ where: { id: itemId }, data: { note: note.trim() || null } });
  await revalidateTask(item.taskId);
  return { ok: true };
}

export async function addAdjustmentAttachment(
  itemId: string,
  kind: AdjustmentAttachmentKind,
  file: { url: string; name: string; mimeType: string },
  uploadedById: string
) {
  const item = await prisma.adjustmentItem.findUniqueOrThrow({ where: { id: itemId } });
  if (!(await canEditTask(item.taskId))) {
    throw new Error("No tenés permiso para editar esta tarea.");
  }
  await prisma.adjustmentAttachment.create({
    data: { adjustmentItemId: itemId, kind, fileUrl: file.url, fileName: file.name, mimeType: file.mimeType, uploadedById },
  });
  await revalidateTask(item.taskId);
}

export async function addAdjustmentLinkAttachment(
  itemId: string,
  kind: AdjustmentAttachmentKind,
  url: string,
  name: string,
  uploadedById: string
) {
  const item = await prisma.adjustmentItem.findUniqueOrThrow({ where: { id: itemId } });
  if (!(await canEditTask(item.taskId))) {
    throw new Error("No tenés permiso para editar esta tarea.");
  }
  const parsedUrl = z.string().trim().url().safeParse(url);
  if (!parsedUrl.success) throw new Error("Ese link no parece válido — revisá que sea una dirección web completa (con https://).");
  const parsedName = z.string().trim().min(1).safeParse(name);
  if (!parsedName.success) throw new Error("Ponele un nombre al link.");
  await prisma.adjustmentAttachment.create({
    data: {
      adjustmentItemId: itemId,
      kind,
      fileUrl: parsedUrl.data,
      fileName: parsedName.data,
      mimeType: LINK_MIME_TYPE,
      uploadedById,
    },
  });
  await revalidateTask(item.taskId);
}

export async function removeAdjustmentAttachment(attachmentId: string) {
  const attachment = await prisma.adjustmentAttachment.findUniqueOrThrow({
    where: { id: attachmentId },
    include: { adjustmentItem: { include: { task: true } } },
  });
  await requireProjectAdmin(attachment.adjustmentItem.task.projectId);
  await prisma.adjustmentAttachment.delete({ where: { id: attachmentId } });
  if (attachment.mimeType !== LINK_MIME_TYPE) {
    await unlink(path.join(process.cwd(), "public", attachment.fileUrl)).catch(() => {});
  }
  await revalidateTask(attachment.adjustmentItem.taskId);
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
