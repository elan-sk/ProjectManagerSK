"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { addBusinessDays } from "@/lib/holidays";
import { notifyAssignment } from "@/lib/notifications";
import type { TaskStatus, TaskType } from "@prisma/client";

export async function addPhase(projectId: string, formData: FormData) {
  const name = z.string().min(1).parse(formData.get("name"));
  const count = await prisma.phase.count({ where: { projectId } });
  await prisma.phase.create({ data: { projectId, name, order: count } });
  revalidatePath(`/projects/${projectId}`);
}

const createTaskSchema = z.object({
  phaseId: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(["SIMPLE", "CHECKLIST", "MILESTONE", "MEETING", "QA", "ADJUSTMENT"]),
  plannedStart: z.coerce.date(),
  durationDays: z.coerce.number().int().min(1).default(1),
  assigneeIds: z.array(z.string()).min(1),
});

export async function addTask(projectId: string, formData: FormData) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

  const data = createTaskSchema.parse({
    phaseId: formData.get("phaseId"),
    title: formData.get("title"),
    type: formData.get("type"),
    plannedStart: formData.get("plannedStart"),
    durationDays: formData.get("durationDays"),
    assigneeIds: formData.getAll("assigneeIds"),
  });

  const plannedEnd =
    data.durationDays <= 1
      ? data.plannedStart
      : await addBusinessDays(project.countryCode, data.plannedStart, data.durationDays - 1);

  const task = await prisma.task.create({
    data: {
      projectId,
      phaseId: data.phaseId,
      title: data.title,
      type: data.type as TaskType,
      plannedStart: data.plannedStart,
      plannedEnd,
      assignees: { create: data.assigneeIds.map((userId) => ({ userId })) },
    },
  });

  await notifyAssignment(task.id, data.assigneeIds);

  revalidatePath(`/projects/${projectId}`);
}

export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { steps: true },
  });

  // Punto 12: una tarea con pasos solo se completa cuando TODOS están hechos.
  if (status === "COMPLETED" && task.steps.some((s) => !s.done)) {
    return { ok: false, error: "Todavía hay pasos del checklist sin completar." };
  }

  await prisma.task.update({
    where: { id: taskId },
    data: {
      status,
      // Punto 8: la fecha real de inicio/fin se registra sola cuando el
      // usuario mueve la tarea, no se completa a mano.
      actualStart: status !== "NOT_STARTED" && !task.actualStart ? new Date() : undefined,
      actualEnd: status === "COMPLETED" ? new Date() : null,
    },
  });

  revalidatePath(`/projects/${task.projectId}`);
  return { ok: true };
}
