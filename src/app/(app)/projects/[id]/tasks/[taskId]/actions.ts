"use server";

import { deleteFileIfUnused } from "@/lib/fileCleanup";
import { revalidatePath } from "next/cache";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createCalendarEvent } from "@/lib/googleCalendar";
import { requireProjectAdmin, canEditTask, getActingUser, type Actor } from "@/lib/permissions";
import { notifyAssignment } from "@/lib/notifications";
import { LINK_MIME_TYPE } from "@/lib/attachments";
import { fetchPageTitle } from "@/lib/pageTitle";
import { bogotaLocalToUTC } from "@/lib/workingHours";
import { propagateToSuccessors } from "../../actions";
import type { AttachmentKind, AdjustmentAttachmentKind, DependencyType } from "@prisma/client";

export async function addStep(taskId: string, formData: FormData, actor?: Actor) {
  if (!(await canEditTask(taskId, actor))) {
    throw new Error("No tenés permiso para editar esta tarea.");
  }
  const description = z.string().min(1).parse(formData.get("description"));
  const count = await prisma.taskStep.count({ where: { taskId } });
  await prisma.taskStep.create({ data: { taskId, description, order: count } });
  await revalidateTask(taskId);
}

export async function toggleStep(stepId: string, done: boolean, actor?: Actor) {
  const step = await prisma.taskStep.findUniqueOrThrow({ where: { id: stepId } });
  if (!(await canEditTask(step.taskId, actor))) {
    throw new Error("No tenés permiso para editar esta tarea.");
  }
  await prisma.taskStep.update({ where: { id: stepId }, data: { done } });
  if (done) await autoAdvanceToInProgress(step.taskId);
  await revalidateTask(step.taskId);
}

export async function updateStep(stepId: string, description: string, actor?: Actor) {
  const step = await prisma.taskStep.findUniqueOrThrow({ where: { id: stepId } });
  if (!(await canEditTask(step.taskId, actor))) {
    throw new Error("No tenés permiso para editar esta tarea.");
  }
  const parsed = z.string().trim().min(1, "Describí el paso.").max(500).safeParse(description);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Paso inválido.");
  await prisma.taskStep.update({ where: { id: stepId }, data: { description: parsed.data } });
  await revalidateTask(step.taskId);
}

export async function reorderSteps(taskId: string, orderedIds: string[], actor?: Actor) {
  if (!(await canEditTask(taskId, actor))) {
    throw new Error("No tenés permiso para editar esta tarea.");
  }
  const steps = await prisma.taskStep.findMany({ where: { taskId }, select: { id: true } });
  const valid = new Set(steps.map((s) => s.id));
  const ids = orderedIds.filter((id) => valid.has(id));
  if (ids.length !== steps.length) throw new Error("La lista de pasos cambió — recargá la página e intentá de nuevo.");
  await prisma.$transaction(ids.map((id, order) => prisma.taskStep.update({ where: { id }, data: { order } })));
  await revalidateTask(taskId);
}

export async function removeStep(stepId: string, actor?: Actor) {
  const step = await prisma.taskStep.findUniqueOrThrow({ where: { id: stepId } });
  if (!(await canEditTask(step.taskId, actor))) {
    throw new Error("No tenés permiso para editar esta tarea.");
  }
  await prisma.taskStep.delete({ where: { id: stepId } });
  await revalidateTask(step.taskId);
}

// Un Entregable, una Revisión, o cualquier tarea con checklist "avisan solas"
// de que arrancaron en cuanto alguien chulea un paso o sube evidencia — nadie
// tiene que acordarse de moverlas a mano a "En curso".
async function autoAdvanceToInProgress(taskId: string) {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { status: true, type: true, actualStart: true, steps: { select: { id: true } } },
  });
  if (task.status !== "NOT_STARTED") return;
  if (task.type !== "MILESTONE" && task.type !== "QA" && task.steps.length === 0) return;
  await prisma.task.update({
    where: { id: taskId },
    data: { status: "IN_PROGRESS", actualStart: task.actualStart ?? new Date() },
  });
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
  if (kind === "RESULTADO") await autoAdvanceToInProgress(taskId);
  await revalidateTask(taskId);
}

// Una tarea ya completada no admite más archivos — tanto insumos como
// evidencia se suben ANTES de cerrarla.
async function assertCanAddAttachment(taskId: string, kind: AttachmentKind) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { status: true } });
  if (task.status === "COMPLETED") {
    const label = kind === "RESULTADO" ? "evidencia" : "insumos";
    throw new Error(`La tarea ya está completada — no se puede subir más ${label}.`);
  }
}

// El filtro "Insumos" de la vista Archivos mezcla adjuntos de tarea
// (Attachment) con archivos subidos directo al proyecto (ProjectAttachment)
// — ambos comparten la misma grilla/botón de borrar, así que esta acción
// resuelve contra la tabla que corresponda según dónde viva el id.
export async function removeAttachment(attachmentId: string) {
  if (attachmentId.startsWith("repo-")) throw new Error("Los repositorios se quitan desde el botón «Repositorios» del proyecto.");
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    include: { task: true },
  });
  if (attachment) {
    await requireProjectAdmin(attachment.task.projectId);
    await prisma.attachment.delete({ where: { id: attachmentId } });
    if (attachment.mimeType !== LINK_MIME_TYPE) {
      await deleteFileIfUnused(attachment.fileUrl);
    }
    await revalidateTask(attachment.taskId);
    return;
  }

  const projectAttachment = await prisma.projectAttachment.findUnique({ where: { id: attachmentId } });
  if (!projectAttachment) {
    // Enlace del proyecto (pestaña Definición / Archivos): no tiene archivo físico.
    const link = await prisma.projectLink.findUniqueOrThrow({ where: { id: attachmentId } });
    await requireProjectAdmin(link.projectId);
    await prisma.projectLink.delete({ where: { id: attachmentId } });
    revalidatePath(`/projects/${link.projectId}`);
    return;
  }
  await requireProjectAdmin(projectAttachment.projectId);
  await prisma.projectAttachment.delete({ where: { id: attachmentId } });
  if (projectAttachment.mimeType !== LINK_MIME_TYPE) {
    await deleteFileIfUnused(projectAttachment.fileUrl);
  }
  revalidatePath(`/projects/${projectAttachment.projectId}`);
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
  const parsedUrl = parsedUrlResult.data;
  // Sin nombre se usa el título de la página; si no se logra obtener, se pide el nombre.
  const parsedName = name.trim() || (await fetchPageTitle(parsedUrl));
  if (!parsedName) {
    throw new Error("No se pudo obtener el nombre de ese link. Escribí uno.");
  }
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
  if (kind === "RESULTADO") await autoAdvanceToInProgress(taskId);
  await revalidateTask(taskId);
}

export async function setDependency(taskId: string, formData: FormData, actor?: Actor) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: { project: true } });
  await requireProjectAdmin(task.projectId, actor);

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

export async function removeDependency(dependencyId: string, taskId: string, actor?: Actor) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  await requireProjectAdmin(task.projectId, actor);

  await prisma.taskDependency.delete({ where: { id: dependencyId } });
  await revalidateTask(taskId);
  revalidatePath(`/projects/${task.projectId}`);
}

export async function setTaskAssignees(taskId: string, formData: FormData, actor?: Actor) {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { assignees: true, reviewers: true },
  });
  if (!(await canEditTask(taskId, actor))) {
    return { ok: false, error: "No tenés permiso para editar esta tarea." };
  }

  const assigneeIds = formData.getAll("assigneeIds") as string[];
  // Un asignado no puede ser también revisor de la misma tarea (Prueba) —
  // mismo criterio que setTaskReviewers, del otro lado.
  const reviewerIds = task.reviewers.map((r) => r.userId);
  if (assigneeIds.some((id) => reviewerIds.includes(id))) {
    return { ok: false, error: "Un asignado a la tarea no puede ser también su revisor." };
  }
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

  const parsed = z.enum(["SIMPLE", "MILESTONE", "QA", "ADJUSTMENT", "ACCEPTANCE"]).safeParse(type);
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
  const item = await prisma.adjustmentItem.findUniqueOrThrow({ where: { id: itemId } });
  if (!(await canEditTask(item.taskId))) {
    throw new Error("No tenés permiso para editar esta tarea.");
  }
  await prisma.adjustmentItem.delete({ where: { id: itemId } });
  await revalidateTask(item.taskId);
}

export async function updateAdjustmentItem(itemId: string, description: string) {
  const item = await prisma.adjustmentItem.findUniqueOrThrow({ where: { id: itemId } });
  if (!(await canEditTask(item.taskId))) {
    return { ok: false as const, error: "No tenés permiso para editar esta tarea." };
  }
  const parsed = z.string().trim().min(1, "Describí el cambio solicitado.").max(1000).safeParse(description);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Cambio inválido." };
  await prisma.adjustmentItem.update({ where: { id: itemId }, data: { description: parsed.data } });
  await revalidateTask(item.taskId);
  return { ok: true as const };
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
    await deleteFileIfUnused(attachment.fileUrl);
  }
  await revalidateTask(attachment.adjustmentItem.taskId);
}

export async function deleteTask(taskId: string, actor?: Actor) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  try {
    await requireProjectAdmin(task.projectId, actor);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  await prisma.task.delete({ where: { id: taskId } });
  revalidatePath(`/projects/${task.projectId}`);
  return { ok: true };
}

export async function syncTaskToGoogleCalendar(taskId: string, userId: string) {
  // El evento va al calendario de quien tiene la sesión: nunca al de otra persona.
  const me = await getActingUser();
  if (!me || me.id !== userId) return { ok: false, error: "No se pudo verificar la sesión." };
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
