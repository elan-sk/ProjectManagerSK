"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { addBusinessDays, businessDaysBetween } from "@/lib/holidays";
import { notifyAssignment } from "@/lib/notifications";
import { requireProjectAdmin, canUpdateTaskStatus } from "@/lib/permissions";
import type { TaskStatus, TaskType, Prisma } from "@prisma/client";

export async function addPhase(projectId: string, formData: FormData) {
  try {
    await requireProjectAdmin(projectId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  const name = z.string().min(1).parse(formData.get("name"));
  const count = await prisma.phase.count({ where: { projectId } });
  await prisma.phase.create({ data: { projectId, name, order: count } });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function reassignPM(projectId: string, formData: FormData) {
  try {
    await requireProjectAdmin(projectId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  const pmId = z.string().min(1).parse(formData.get("pmId"));
  await prisma.project.update({ where: { id: projectId }, data: { pmId } });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  return { ok: true };
}

export async function updateProjectStartDate(projectId: string, formData: FormData) {
  try {
    await requireProjectAdmin(projectId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  const startDate = z.coerce.date().parse(formData.get("startDate"));
  await prisma.project.update({ where: { id: projectId }, data: { startDate } });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  return { ok: true };
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
  try {
    await requireProjectAdmin(projectId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

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
  return { ok: true };
}

export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  if (!(await canUpdateTaskStatus(taskId))) {
    return { ok: false, error: "Solo un asignado a esta tarea, el PM del proyecto o un administrador pueden cambiar su estado." };
  }

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

// Inicio mínimo/requerido de una tarea dadas TODAS sus predecesoras, sin
// importar el tipo de cada vínculo: FINISH_TO_START exige empezar el día
// hábil siguiente al fin de esa predecesora; START_TO_START ("en paralelo",
// ej. QA continua junto a su Sprint) exige empezar el MISMO día que ella.
// Con varias predecesoras, manda la más exigente (el máximo).
async function requiredStartFor(
  countryCode: string,
  dependsOn: { type: "FINISH_TO_START" | "START_TO_START"; predecessor: { plannedStart: Date; plannedEnd: Date } }[],
  projectStartDate: Date
) {
  if (dependsOn.length === 0) return projectStartDate;
  const candidates = await Promise.all(
    dependsOn.map((d) =>
      d.type === "START_TO_START"
        ? d.predecessor.plannedStart
        : addBusinessDays(countryCode, d.predecessor.plannedEnd, 1)
    )
  );
  return new Date(Math.max(projectStartDate.getTime(), ...candidates.map((d) => d.getTime())));
}

// Vínculo en AMBOS sentidos (confirmado con el usuario): cuando una tarea
// cambia — su inicio o su fin, se alarga o se acorta — cada sucesora
// directa se re-sincroniza contra el tipo de vínculo que tenga con ella,
// manteniendo su propia duración en días hábiles. Sigue en cadena a las
// sucesoras de las sucesoras. Una tarea ya COMPLETED no se re-planifica (no
// tiene sentido mover fechas planeadas de algo que ya se hizo). `tx` es la
// transacción de Prisma (atomicidad); getHolidays/addBusinessDays usan el
// cliente global porque solo leen/cachean la tabla Holiday, independiente
// de esta transacción.
export async function propagateToSuccessors(tx: Prisma.TransactionClient, countryCode: string, fromTaskId: string) {
  const queue = [fromTaskId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const taskId = queue.shift()!;
    if (visited.has(taskId)) continue;
    visited.add(taskId);

    const successorLinks = await tx.taskDependency.findMany({
      where: { predecessorId: taskId },
      select: { successorId: true },
    });

    for (const { successorId } of successorLinks) {
      const successor = await tx.task.findUniqueOrThrow({
        where: { id: successorId },
        include: {
          project: { select: { startDate: true } },
          dependsOn: { include: { predecessor: { select: { plannedStart: true, plannedEnd: true } } } },
        },
      });
      if (successor.status === "COMPLETED") continue;

      const requiredStart = await requiredStartFor(countryCode, successor.dependsOn, successor.project.startDate);

      if (successor.plannedStart.getTime() !== requiredStart.getTime()) {
        const ownDuration = await businessDaysBetween(countryCode, successor.plannedStart, successor.plannedEnd);
        const newEnd =
          ownDuration <= 1 ? requiredStart : await addBusinessDays(countryCode, requiredStart, ownDuration - 1);
        await tx.task.update({ where: { id: successorId }, data: { plannedStart: requiredStart, plannedEnd: newEnd } });
      }
      queue.push(successorId);
    }
  }
}

/**
 * Arrastre de los extremos de la barra en el Gantt (punto 6). `edge`
 * indica qué extremo se movió; el otro extremo de ESA tarea queda fijo (así
 * cambia su duración). El cliente ya clampeó visualmente el arrastre, pero
 * el servidor vuelve a validar con datos frescos antes de guardar.
 */
export async function resizeTask(taskId: string, edge: "start" | "end", newDateStr: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: true,
      dependsOn: { include: { predecessor: { select: { plannedStart: true, plannedEnd: true } } } },
    },
  });
  if (!task) return { ok: false, error: "Tarea no encontrada." };

  try {
    await requireProjectAdmin(task.projectId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  let newDate = new Date(newDateStr);

  if (edge === "start") {
    const minStart = await requiredStartFor(task.project.countryCode, task.dependsOn, task.project.startDate);
    if (newDate.getTime() < minStart.getTime()) newDate = minStart;
    if (newDate.getTime() >= task.plannedEnd.getTime()) {
      return { ok: false, error: "La fecha de inicio no puede alcanzar o superar la fecha de fin." };
    }
    // El inicio también dispara cascada: una sucesora "en paralelo"
    // (START_TO_START) depende del INICIO de esta tarea, no de su fin.
    await prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id: taskId }, data: { plannedStart: newDate } });
      await propagateToSuccessors(tx, task.project.countryCode, taskId);
    });
    revalidatePath(`/projects/${task.projectId}`);
    return { ok: true };
  }

  // edge === "end": no tiene techo propio. Cada sucesora directa (y en
  // cadena, las suyas) se re-sincroniza contra el nuevo fin — hacia
  // adelante si se alargó, hacia atrás si se acortó.
  if (newDate.getTime() <= task.plannedStart.getTime()) {
    return { ok: false, error: "La fecha de fin no puede alcanzar o preceder la fecha de inicio." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { plannedEnd: newDate } });
    await propagateToSuccessors(tx, task.project.countryCode, taskId);
  });

  revalidatePath(`/projects/${task.projectId}`);
  return { ok: true };
}
