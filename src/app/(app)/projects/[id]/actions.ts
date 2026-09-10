"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { addBusinessDays, subtractBusinessDays, businessDaysBetween } from "@/lib/holidays";
import { notifyAssignment, notifyBlocked } from "@/lib/notifications";
import { requireProjectAdmin, canEditTask, getProjectAdmin } from "@/lib/permissions";
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

export async function updateProjectTargetEndDate(projectId: string, formData: FormData) {
  try {
    await requireProjectAdmin(projectId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  const raw = formData.get("targetEndDate");
  const targetEndDate = typeof raw === "string" && raw.trim() !== "" ? z.coerce.date().parse(raw) : null;
  await prisma.project.update({ where: { id: projectId }, data: { targetEndDate } });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  return { ok: true };
}

export async function updateProjectRepoUrl(projectId: string, formData: FormData) {
  try {
    await requireProjectAdmin(projectId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  const raw = formData.get("repoUrl");
  const parsed = typeof raw === "string" && raw.trim() !== "" ? z.string().trim().url().safeParse(raw) : null;
  if (parsed && !parsed.success) {
    return { ok: false, error: "La URL no es válida." };
  }
  await prisma.project.update({ where: { id: projectId }, data: { repoUrl: parsed ? parsed.data : null } });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

const createTaskSchema = z.object({
  phaseId: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(["SIMPLE", "CHECKLIST", "MILESTONE", "MEETING", "QA", "ADJUSTMENT"]),
  description: z.string().nullable(),
  plannedStart: z.coerce.date(),
  durationDays: z.coerce.number().int().min(1).default(1),
  assigneeIds: z.array(z.string()).min(1),
  predecessorId: z.string().optional(),
});

export async function addTask(projectId: string, formData: FormData) {
  try {
    await requireProjectAdmin(projectId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

  const rawDescription = formData.get("description");
  const rawPredecessorId = formData.get("predecessorId");
  const data = createTaskSchema.parse({
    phaseId: formData.get("phaseId"),
    title: formData.get("title"),
    type: formData.get("type"),
    description: typeof rawDescription === "string" && rawDescription.trim() !== "" ? rawDescription : null,
    plannedStart: formData.get("plannedStart"),
    durationDays: formData.get("durationDays"),
    assigneeIds: formData.getAll("assigneeIds"),
    predecessorId: typeof rawPredecessorId === "string" && rawPredecessorId !== "" ? rawPredecessorId : undefined,
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
      description: data.description,
      plannedStart: data.plannedStart,
      plannedEnd,
      assignees: { create: data.assigneeIds.map((userId) => ({ userId })) },
    },
  });

  // Si eligieron predecesora, el vínculo nace consistente de una vez —
  // mismo mecanismo que setDependency (punto ya confirmado): resincroniza
  // la nueva tarea (y en cadena, sus propias sucesoras) contra la fecha real
  // de la predecesora, en vez de dejarla con la fecha que puso el usuario.
  if (data.predecessorId) {
    await prisma.$transaction(async (tx) => {
      await tx.taskDependency.create({
        data: { predecessorId: data.predecessorId!, successorId: task.id, type: "FINISH_TO_START" },
      });
      await propagateToSuccessors(tx, project.countryCode, data.predecessorId!);
    });
  }

  await notifyAssignment(task.id, data.assigneeIds);

  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  if (!(await canEditTask(taskId))) {
    return { ok: false, error: "Solo un asignado a esta tarea, el PM del proyecto o un administrador pueden cambiar su estado." };
  }

  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { steps: true },
  });

  // Un miembro sin permisos de PM/admin no puede reabrir una tarea ya
  // completada, ni devolver una "En curso"/"Bloqueada" a "Sin iniciar".
  if (!(await getProjectAdmin(task.projectId))) {
    if (task.status === "COMPLETED" && status !== "COMPLETED") {
      return { ok: false, error: "Solo el PM del proyecto o un administrador pueden cambiar el estado de una tarea completada." };
    }
    if (status === "NOT_STARTED" && (task.status === "IN_PROGRESS" || task.status === "BLOCKED")) {
      return { ok: false, error: "Solo el PM del proyecto o un administrador pueden devolver una tarea a \"Sin iniciar\"." };
    }
  }

  // Punto 12: una tarea con pasos solo se completa cuando TODOS están hechos.
  if (status === "COMPLETED" && task.steps.some((s) => !s.done)) {
    return { ok: false, error: "Todavía hay pasos del checklist sin completar." };
  }

  // Holgura/retraso (punto confirmado con el usuario): plannedEnd de ESTA
  // tarea no se toca (queda como línea base para los reportes de
  // rendimiento — ver getTaskDelayDays/getTaskEarlyDays), pero si termina
  // antes o después de esa fecha, sus sucesoras deben correrse usando su
  // actualEnd real. propagateToSuccessors ya sabe hacer esto (ver
  // requiredStartFor) en cuanto actualEnd quede guardado, así que alcanza
  // con dispararlo dentro de la misma transacción al completar.
  let pmId: string | null = null;

  await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUniqueOrThrow({
      where: { id: task.projectId },
      select: { countryCode: true, pmId: true },
    });
    pmId = project.pmId;
    await tx.task.update({
      where: { id: taskId },
      data: {
        status,
        // Punto 8: la fecha real de inicio/fin se registra sola cuando el
        // usuario mueve la tarea, no se completa a mano.
        actualStart: status !== "NOT_STARTED" && !task.actualStart ? new Date() : undefined,
        actualEnd: status === "COMPLETED" ? new Date() : null,
      },
    });
    if (status === "COMPLETED") {
      await propagateToSuccessors(tx, project.countryCode, taskId);
    }
  });

  if (status === "BLOCKED" && task.status !== "BLOCKED" && pmId) {
    const session = await auth();
    if (pmId !== session?.user?.id) {
      await notifyBlocked(taskId, pmId);
    }
  }

  revalidatePath(`/projects/${task.projectId}`);
  return { ok: true };
}

// Inicio mínimo/requerido de una tarea dadas TODAS sus predecesoras, sin
// importar el tipo de cada vínculo: FINISH_TO_START exige empezar el día
// hábil siguiente al fin de esa predecesora; START_TO_START ("en paralelo",
// ej. QA continua junto a su Sprint) exige empezar el MISMO día que ella.
// Con varias predecesoras, manda la más exigente (el máximo).
//
// Holgura/retraso (punto confirmado con el usuario): si la predecesora ya
// COMPLETED terminó antes o después de su plannedEnd, la sucesora se
// sincroniza contra su actualEnd real, no contra el plannedEnd planeado —
// así una tarea que se adelantó corre a sus sucesoras hacia atrás (holgura)
// y una que se atrasó las corre hacia adelante (retraso). El plannedEnd de
// la predecesora en sí NO se toca (línea base para reportes).
async function requiredStartFor(
  countryCode: string,
  dependsOn: {
    type: "FINISH_TO_START" | "START_TO_START";
    predecessor: { status: TaskStatus; plannedStart: Date; plannedEnd: Date; actualEnd: Date | null };
  }[],
  projectStartDate: Date
) {
  if (dependsOn.length === 0) return projectStartDate;
  const candidates = await Promise.all(
    dependsOn.map((d) => {
      if (d.type === "START_TO_START") return d.predecessor.plannedStart;
      const effectiveEnd =
        d.predecessor.status === "COMPLETED" && d.predecessor.actualEnd
          ? d.predecessor.actualEnd
          : d.predecessor.plannedEnd;
      return addBusinessDays(countryCode, effectiveEnd, 1);
    })
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
          dependsOn: {
            include: { predecessor: { select: { status: true, plannedStart: true, plannedEnd: true, actualEnd: true } } },
          },
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
      dependsOn: {
        include: { predecessor: { select: { status: true, plannedStart: true, plannedEnd: true, actualEnd: true } } },
      },
    },
  });
  if (!task) return { ok: false, error: "Tarea no encontrada." };

  try {
    await requireProjectAdmin(task.projectId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  // Restricciones confirmadas con el usuario: la fecha de inicio ya no se
  // toca en cuanto la tarea deja "sin iniciar" (arrancó de verdad); la fecha
  // de fin ya no se toca una vez COMPLETED. El cliente (GanttBar) ya oculta
  // el handle correspondiente, pero la autoridad real es esta validación.
  if (edge === "start" && task.status !== "NOT_STARTED") {
    return { ok: false, error: "No se puede mover la fecha de inicio de una tarea que ya inició." };
  }
  if (edge === "end" && task.status === "COMPLETED") {
    return { ok: false, error: "No se puede mover la fecha de fin de una tarea completada." };
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

/**
 * Arrastre del CUERPO de la barra (mover la tarea completa, no solo un
 * extremo): desplaza inicio y fin juntos, conservando la duración. Misma
 * restricción que el handle izquierdo de resizeTask — reescribe el inicio,
 * así que solo aplica a tareas que todavía no arrancaron.
 */
export async function moveTask(taskId: string, newStartDateStr: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: true,
      dependsOn: {
        include: { predecessor: { select: { status: true, plannedStart: true, plannedEnd: true, actualEnd: true } } },
      },
    },
  });
  if (!task) return { ok: false, error: "Tarea no encontrada." };

  try {
    await requireProjectAdmin(task.projectId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  if (task.status !== "NOT_STARTED") {
    return { ok: false, error: "No se puede mover una tarea que ya inició." };
  }

  let newStart = new Date(newStartDateStr);
  const minStart = await requiredStartFor(task.project.countryCode, task.dependsOn, task.project.startDate);
  if (newStart.getTime() < minStart.getTime()) newStart = minStart;

  const ownDuration = await businessDaysBetween(task.project.countryCode, task.plannedStart, task.plannedEnd);
  const newEnd =
    ownDuration <= 1 ? newStart : await addBusinessDays(task.project.countryCode, newStart, ownDuration - 1);

  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { plannedStart: newStart, plannedEnd: newEnd } });
    await propagateToSuccessors(tx, task.project.countryCode, taskId);
  });

  revalidatePath(`/projects/${task.projectId}`);
  return { ok: true };
}

/**
 * Igual que moveTask pero para varias tareas seleccionadas a la vez,
 * desplazadas el mismo delta de días hábiles (arrastrar cualquiera de las
 * barras seleccionadas mueve a todo el grupo junto). Punto confirmado con el
 * usuario: si alguna tarea del grupo tiene una predecesora FUERA del grupo,
 * el delta se recorta al máximo que no viole esa dependencia — nunca se
 * rechaza todo el movimiento, y todas las tareas del grupo se mueven el
 * mismo delta ya recortado (nunca delta distinto entre ellas).
 */
export async function moveTaskGroup(taskIds: string[], deltaDays: number) {
  if (taskIds.length === 0 || deltaDays === 0) return { ok: true, appliedDelta: 0 };

  const projectId = (await prisma.task.findUniqueOrThrow({ where: { id: taskIds[0] } })).projectId;
  try {
    await requireProjectAdmin(projectId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const result = await applyGroupMove(taskIds, deltaDays);
  if (result.ok && result.appliedDelta !== 0) revalidatePath(`/projects/${projectId}`);
  return result;
}

// Lógica pura (sin chequeo de permisos NI revalidatePath, que exige contexto
// de request) separada de moveTaskGroup para poder probarla directamente
// desde scripts/verify-move-task-group.ts — mismo motivo por el que
// propagateToSuccessors está exportada aparte.
export async function applyGroupMove(taskIds: string[], deltaDays: number) {
  if (taskIds.length === 0 || deltaDays === 0) return { ok: true, appliedDelta: 0 };

  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    include: {
      project: true,
      dependsOn: {
        include: { predecessor: { select: { status: true, plannedStart: true, plannedEnd: true, actualEnd: true } } },
      },
    },
  });
  if (tasks.length === 0) return { ok: false, error: "Tareas no encontradas." };

  const projectId = tasks[0].projectId;
  if (tasks.some((t) => t.projectId !== projectId)) {
    return { ok: false, error: "Solo se puede mover en bloque tareas del mismo proyecto." };
  }

  if (tasks.some((t) => t.status !== "NOT_STARTED")) {
    return { ok: false, error: "Solo se pueden mover en bloque tareas que todavía no iniciaron." };
  }

  const countryCode = tasks[0].project.countryCode;
  const groupIds = new Set(taskIds);

  let effectiveDelta = deltaDays;
  if (deltaDays < 0) {
    for (const task of tasks) {
      const externalDeps = task.dependsOn.filter((d) => !groupIds.has(d.predecessorId));
      if (externalDeps.length === 0) continue;
      const minStart = await requiredStartFor(countryCode, externalDeps, task.project.startDate);
      if (task.plannedStart.getTime() <= minStart.getTime()) {
        effectiveDelta = Math.max(effectiveDelta, 0);
        continue;
      }
      const slack = (await businessDaysBetween(countryCode, minStart, task.plannedStart)) - 1;
      effectiveDelta = Math.max(effectiveDelta, -slack);
    }
  }

  if (effectiveDelta !== 0) {
    await prisma.$transaction(async (tx) => {
      for (const task of tasks) {
        const shift = (date: Date) =>
          effectiveDelta >= 0
            ? addBusinessDays(countryCode, date, effectiveDelta)
            : subtractBusinessDays(countryCode, date, -effectiveDelta);
        const [newStart, newEnd] = await Promise.all([shift(task.plannedStart), shift(task.plannedEnd)]);
        await tx.task.update({ where: { id: task.id }, data: { plannedStart: newStart, plannedEnd: newEnd } });
      }
      for (const task of tasks) {
        await propagateToSuccessors(tx, countryCode, task.id);
      }
    });
  }

  return { ok: true, appliedDelta: effectiveDelta };
}
