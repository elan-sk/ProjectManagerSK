"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { addBusinessDays, subtractBusinessDays, businessDaysBetween } from "@/lib/holidays";
import { notifyAssignment, notifyBlocked } from "@/lib/notifications";
import { requireProjectAdmin, canEditTask, canReviewTask, getProjectAdmin, type Actor } from "@/lib/permissions";
import { upsertTag } from "@/lib/tags";
import type { TaskStatus, TaskType, Prisma } from "@prisma/client";

// Solo un administrador global (no el PM del proyecto) puede archivarlo.
// Antes esto era un borrado real (prisma.project.delete), pero el cascade
// sobre un proyecto con historial real (miles de notificaciones/tareas/
// revisiones) bloqueaba esas tablas el tiempo suficiente para colgar toda
// la app en el hosting compartido. Archivar es un solo UPDATE — instantáneo,
// sin cascade — y el proyecto queda invisible en /projects y en cualquier
// selector, exactamente como un borrado desde la perspectiva de uso normal.
export async function archiveProject(projectId: string) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return { ok: false, error: "Solo un administrador puede eliminar un proyecto." };
  }

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return { ok: false, error: "Proyecto no encontrado." };

  await prisma.project.update({ where: { id: projectId }, data: { status: "ARCHIVED" } });

  revalidatePath("/projects");
  return { ok: true };
}

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

export async function reassignPM(projectId: string, formData: FormData, actor?: Actor) {
  try {
    await requireProjectAdmin(projectId, actor);
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
  const parsedDate = z.coerce.date().safeParse(formData.get("startDate"));
  if (!parsedDate.success) return { ok: false, error: "Elegí una fecha válida." };
  await prisma.project.update({ where: { id: projectId }, data: { startDate: parsedDate.data } });
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
  let targetEndDate: Date | null = null;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsedDate = z.coerce.date().safeParse(raw);
    if (!parsedDate.success) return { ok: false, error: "Elegí una fecha válida." };
    targetEndDate = parsedDate.data;
  }
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
  type: z.enum(["SIMPLE", "MILESTONE", "QA", "ADJUSTMENT", "ACCEPTANCE"]),
  description: z.string().nullable(),
  plannedStart: z.coerce.date(),
  durationDays: z.coerce.number().int().min(1).default(1),
  assigneeIds: z.array(z.string()).min(1),
  predecessorId: z.string().optional(),
  // Punto 10: solo tiene sentido (y solo se manda desde el form) para tipo
  // Prueba — revisor(es) desde la creación, y la plantilla que se copiará
  // sola como checks apenas nazca la ronda 1 (ver submitReviewRound).
  reviewerIds: z.array(z.string()).default([]),
  defaultTestTemplateId: z.string().optional(),
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
  const rawTemplateId = formData.get("defaultTestTemplateId");
  const parsed = createTaskSchema.safeParse({
    phaseId: formData.get("phaseId"),
    title: formData.get("title"),
    type: formData.get("type"),
    description: typeof rawDescription === "string" && rawDescription.trim() !== "" ? rawDescription : null,
    plannedStart: formData.get("plannedStart"),
    durationDays: formData.get("durationDays"),
    assigneeIds: formData.getAll("assigneeIds"),
    predecessorId: typeof rawPredecessorId === "string" && rawPredecessorId !== "" ? rawPredecessorId : undefined,
    reviewerIds: formData.getAll("reviewerIds"),
    defaultTestTemplateId: typeof rawTemplateId === "string" && rawTemplateId !== "" ? rawTemplateId : undefined,
  });
  if (!parsed.success) {
    // Punto (bug real): antes esto tiraba un ZodError crudo sin capturar —
    // el caso más común es crear una tarea sin marcar ningún asignado
    // (el checklist de checkboxes no tiene forma nativa de exigir "al
    // menos uno"). Mensaje claro en vez de la pantalla de error de Next.
    const missingAssignee = parsed.error.issues.some((i) => i.path[0] === "assigneeIds");
    const missingDate = parsed.error.issues.some((i) => i.path[0] === "plannedStart");
    return {
      ok: false,
      error: missingAssignee
        ? "Elegí al menos un asignado."
        : missingDate
          ? "Elegí una fecha de inicio válida."
          : parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }
  const data = parsed.data;

  // Un asignado no puede ser también revisor de la misma tarea (Prueba) —
  // se pierde el sentido de la revisión si alguien se corrige a sí mismo.
  if (data.type === "QA" && data.reviewerIds.some((id) => data.assigneeIds.includes(id))) {
    return { ok: false, error: "Un asignado a la tarea no puede ser también su revisor." };
  }

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
      reviewers: data.type === "QA" ? { create: data.reviewerIds.map((userId) => ({ userId })) } : undefined,
      defaultTestTemplateId: data.type === "QA" ? data.defaultTestTemplateId : undefined,
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
  await attachTagsToNewTask(task.id, projectId, formData);

  revalidatePath(`/projects/${projectId}`);
  return { ok: true, id: task.id };
}

// Punto 17: etiquetas elegidas desde el formulario de creación — llegan como
// dos arrays paralelos (NewTaskTagsPicker no puede armar el taskId todavía,
// así que cada fila viaja como un par de inputs ocultos). Reusa el mismo
// upsertTag que setTaskTag, para que crear una etiqueta nueva se comporte
// igual sin importar si nace en la creación o después.
async function attachTagsToNewTask(taskId: string, projectId: string, formData: FormData) {
  const categoryIds = formData.getAll("tagCategoryId") as string[];
  const names = formData.getAll("tagName") as string[];
  for (let i = 0; i < categoryIds.length; i++) {
    const categoryId = categoryIds[i]?.trim();
    const name = names[i]?.trim();
    if (!categoryId || !name) continue;
    const tag = await upsertTag(projectId, categoryId, name);
    await prisma.taskTag.create({ data: { taskId, categoryId, tagId: tag.id } });
  }
}

const insertAdjacentTaskSchema = z.object({
  title: z.string().min(1),
  type: z.enum(["SIMPLE", "MILESTONE", "QA", "ADJUSTMENT", "ACCEPTANCE"]),
  description: z.string().nullable(),
  plannedStart: z.coerce.date(),
  durationDays: z.coerce.number().int().min(1).default(1),
  assigneeIds: z.array(z.string()).min(1),
  predecessorId: z.string().optional(),
});

// Lógica pura de "Crear predecesor"/"Crear sucesor" (sin el chequeo de
// permisos, separado así para poder probarla directo desde
// scripts/verify-insert-adjacent-task.ts, mismo patrón que
// propagateToSuccessors): crea una tarea nueva en la MISMA fase que la tarea
// de origen. Si el lado pedido ya tenía vínculo(s) directos (ej. origin ya
// tenía una sucesora), esos vínculos se cortan y se recablean a través de la
// nueva tarea en vez de coexistir con ella — así queda insertada EN MEDIO de
// la cadena. La cascada ya existente (propagateToSuccessors) es la que
// efectivamente empuja hacia adelante lo que sigue, igual que cualquier otro
// cambio de fecha en el Gantt.
export async function insertAdjacentTaskCore(
  originTaskId: string,
  role: "predecessor" | "successor",
  data: {
    title: string;
    type: TaskType;
    description: string | null;
    plannedStart: Date;
    durationDays: number;
    assigneeIds: string[];
    predecessorId?: string;
  }
) {
  const origin = await prisma.task.findUniqueOrThrow({
    where: { id: originTaskId },
    include: { project: true, dependsOn: true, blocks: true },
  });

  const plannedEnd =
    data.durationDays <= 1
      ? data.plannedStart
      : await addBusinessDays(origin.project.countryCode, data.plannedStart, data.durationDays - 1);

  return prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        projectId: origin.projectId,
        phaseId: origin.phaseId,
        title: data.title,
        type: data.type,
        description: data.description,
        plannedStart: data.plannedStart,
        plannedEnd,
        assignees: { create: data.assigneeIds.map((userId) => ({ userId })) },
      },
    });

    if (role === "successor") {
      await tx.taskDependency.create({
        data: { predecessorId: originTaskId, successorId: created.id, type: "FINISH_TO_START" },
      });
      for (const link of origin.blocks) {
        await tx.taskDependency.delete({ where: { id: link.id } });
        await tx.taskDependency.create({
          data: { predecessorId: created.id, successorId: link.successorId, type: link.type },
        });
      }
      await propagateToSuccessors(tx, origin.project.countryCode, originTaskId);
    } else {
      await tx.taskDependency.create({
        data: { predecessorId: created.id, successorId: originTaskId, type: "FINISH_TO_START" },
      });
      // origin ya no puede seguir dependiendo directo de lo que tenía antes
      // (ahora depende de created); si el usuario eligió un predecesor para
      // la nueva tarea (precargado en el form con ese mismo vínculo previo,
      // pero editable), se reengancha ahí en vez de asumirlo siempre.
      for (const link of origin.dependsOn) {
        await tx.taskDependency.delete({ where: { id: link.id } });
      }
      if (data.predecessorId) {
        await tx.taskDependency.create({
          data: { predecessorId: data.predecessorId, successorId: created.id, type: "FINISH_TO_START" },
        });
        await propagateToSuccessors(tx, origin.project.countryCode, data.predecessorId);
      } else {
        await propagateToSuccessors(tx, origin.project.countryCode, created.id);
      }
    }

    return created.id;
  });
}

// Menú contextual del Gantt: valida permisos y datos, delega la lógica real
// a insertAdjacentTaskCore.
export async function insertAdjacentTask(originTaskId: string, role: "predecessor" | "successor", formData: FormData) {
  const origin = await prisma.task.findUnique({ where: { id: originTaskId } });
  if (!origin) return { ok: false, error: "Tarea no encontrada." };

  try {
    await requireProjectAdmin(origin.projectId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const rawDescription = formData.get("description");
  const rawPredecessorId = formData.get("predecessorId");
  const parsed = insertAdjacentTaskSchema.safeParse({
    title: formData.get("title"),
    type: formData.get("type"),
    description: typeof rawDescription === "string" && rawDescription.trim() !== "" ? rawDescription : null,
    plannedStart: formData.get("plannedStart"),
    durationDays: formData.get("durationDays"),
    assigneeIds: formData.getAll("assigneeIds"),
    predecessorId: typeof rawPredecessorId === "string" && rawPredecessorId !== "" ? rawPredecessorId : undefined,
  });
  if (!parsed.success) {
    const missingAssignee = parsed.error.issues.some((i) => i.path[0] === "assigneeIds");
    const missingDate = parsed.error.issues.some((i) => i.path[0] === "plannedStart");
    return {
      ok: false,
      error: missingAssignee
        ? "Elegí al menos un asignado."
        : missingDate
          ? "Elegí una fecha de inicio válida."
          : parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }
  const data = parsed.data;

  const createdId = await insertAdjacentTaskCore(originTaskId, role, { ...data, type: data.type as TaskType });

  await notifyAssignment(createdId, data.assigneeIds);

  revalidatePath(`/projects/${origin.projectId}`);
  revalidatePath("/projects");
  return { ok: true, id: createdId };
}

// Punto 12: bloqueo optimista — `expectedUpdatedAt` es el updatedAt que el
// cliente tenía cargado cuando arrancó el arrastre. Si alguien más ya
// modificó la tarea desde entonces, se rechaza en vez de pisar ese cambio
// (el cliente ya revierte su UI optimista y el próximo refresh —automático,
// ver LiveRefresh— trae la versión real). Opcional para no romper otros
// llamadores (ej. TaskStatusControl) que todavía no mandan este dato.
function assertNotStale(task: { updatedAt: Date }, expectedUpdatedAt?: string) {
  if (expectedUpdatedAt && task.updatedAt.toISOString() !== expectedUpdatedAt) {
    throw new Error("Alguien más actualizó esta tarea justo ahora — se refrescó sola, fijate el estado real antes de reintentar.");
  }
}

// `actor` es opcional: sin él usa la sesión del navegador (auth()) como
// siempre; la API pública (login por usuario/contraseña) pasa el suyo
// explícito para reusar EXACTAMENTE estas mismas reglas sin duplicarlas.
export async function updateTaskStatus(taskId: string, status: TaskStatus, expectedUpdatedAt?: string, actor?: Actor) {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: {
      steps: true,
      attachments: { select: { kind: true } },
      adjustmentItems: { include: { attachments: { select: { kind: true } } } },
      reviewRounds: { orderBy: { roundNumber: "desc" }, take: 1 },
    },
  });

  try {
    assertNotStale(task, expectedUpdatedAt);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  // Punto 15: completar una Prueba es del revisor (canReviewTask ya incluye
  // PM/admin, igual que en el resto de la app) — un asignado que no es
  // también revisor no puede finalizarla, aunque sí siga pudiendo editar el
  // resto de la tarea. Para cualquier otro caso, sigue la regla de siempre.
  const canChangeStatus =
    status === "COMPLETED" && task.type === "QA" ? await canReviewTask(taskId, actor) : await canEditTask(taskId, actor);
  if (!canChangeStatus) {
    return {
      ok: false,
      error:
        status === "COMPLETED" && task.type === "QA"
          ? "Solo el revisor, el PM del proyecto o un administrador pueden completar esta prueba."
          : "Solo un asignado a esta tarea, el PM del proyecto o un administrador pueden cambiar su estado.",
    };
  }

  // Punto 17: el estado Devuelto de una Prueba está ligado a sus rondas —
  // nadie, ni siquiera PM/admin, puede sacarla de Devuelta a mano. La única
  // salida es reenviar la ronda (submitReviewRound) hasta que quede
  // aprobada, que sí puede volver a poner la tarea en curso.
  if (task.type === "QA" && task.status === "RETURNED") {
    return { ok: false, error: "Esta tarea está devuelta por revisión — no se puede cambiar el estado hasta pasar la prueba (reenviá una nueva ronda)." };
  }
  // Mismo criterio que QA, pero "devuelta" acá la pone el cliente al
  // rechazar una característica (ver setPublicAcceptanceDecision) en vez de
  // un revisor interno.
  if (task.type === "ACCEPTANCE" && task.status === "RETURNED") {
    return { ok: false, error: "El cliente devolvió esta entrega — no se puede cambiar el estado hasta reenviar una nueva ronda." };
  }

  // Un miembro sin permisos de PM/admin no puede reabrir una tarea ya
  // completada, ni devolver una "En curso"/"Bloqueada" a "Sin iniciar".
  if (!(await getProjectAdmin(task.projectId, actor))) {
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

  // Punto 2.3: un Entregable exige evidencia cargada antes de poder cerrarse.
  if (status === "COMPLETED" && task.type === "MILESTONE" && !task.attachments.some((a) => a.kind === "RESULTADO")) {
    return { ok: false, error: "Este entregable necesita al menos una evidencia cargada para poder completarse." };
  }

  // Punto 2.5: un Ajuste solo se completa cuando todos sus cambios quedaron
  // respondidos (con un "Después" cargado o una nota de que no aplica) — el
  // estado nunca se marca a mano con un checkbox.
  if (status === "COMPLETED" && task.type === "ADJUSTMENT") {
    const pending = task.adjustmentItems.filter(
      (item) => !item.note && !item.attachments.some((a) => a.kind === "AFTER")
    );
    if (pending.length > 0) {
      return { ok: false, error: `Todavía hay ${pending.length} cambio(s) sin responder (falta el "Después" o una nota).` };
    }
  }

  // Punto 2.6: una Revisión solo se completa cuando su última ronda quedó
  // aprobada — ni con una ronda todavía abierta, ni con la última devuelta.
  if (status === "COMPLETED" && task.type === "QA") {
    const lastRound = task.reviewRounds[0];
    if (!lastRound || lastRound.outcome !== "APPROVED") {
      return { ok: false, error: "Esta revisión necesita una ronda aprobada antes de poder completarse." };
    }
  }

  // Aceptación: mismo criterio que QA, pero quien aprueba la última ronda es
  // el cliente (ver setPublicAcceptanceDecision), no un revisor interno.
  if (status === "COMPLETED" && task.type === "ACCEPTANCE") {
    const lastRound = task.reviewRounds[0];
    if (!lastRound || lastRound.outcome !== "APPROVED") {
      return { ok: false, error: "Esta entrega necesita una ronda aceptada por el cliente antes de poder completarse." };
    }
  }

  // Holgura/retraso (punto confirmado con el usuario): plannedEnd de ESTA
  // tarea no se toca (queda como línea base para los reportes de
  // rendimiento — ver getTaskDelayDays/getTaskEarlyDays), pero si termina
  // antes o después de esa fecha, sus sucesoras deben correrse usando su
  // actualEnd real. propagateToSuccessors ya sabe hacer esto (ver
  // requiredStartFor) en cuanto actualEnd quede guardado, así que alcanza
  // con dispararlo dentro de la misma transacción al completar.
  let pmId: string | null = null;
  let updatedAt: string | undefined;

  await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUniqueOrThrow({
      where: { id: task.projectId },
      select: { countryCode: true, pmId: true },
    });
    pmId = project.pmId;
    const updated = await tx.task.update({
      where: { id: taskId },
      data: {
        status,
        // Punto 8: la fecha real de inicio/fin se registra sola cuando el
        // usuario mueve la tarea, no se completa a mano.
        actualStart: status !== "NOT_STARTED" && !task.actualStart ? new Date() : undefined,
        actualEnd: status === "COMPLETED" ? new Date() : null,
      },
    });
    updatedAt = updated.updatedAt.toISOString();
    if (status === "COMPLETED") {
      await propagateToSuccessors(tx, project.countryCode, taskId);
    }
  });

  if (status === "BLOCKED" && task.status !== "BLOCKED" && pmId) {
    const actingUserId = actor?.id ?? (await auth())?.user?.id;
    if (pmId !== actingUserId) {
      await notifyBlocked(taskId, pmId);
    }
  }

  revalidatePath(`/projects/${task.projectId}`);
  // updatedAt nuevo: el tablero lo necesita para el siguiente movimiento de
  // una card que ya no vuelve en el listado filtrado (bloqueo optimista).
  return { ok: true, updatedAt };
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

// Punto 10: una vez que una tarea tipo Ajuste o Prueba ya arrancó su
// procedimiento (al menos una evidencia/adjunto cargado, o al menos una
// ronda de revisión iniciada), NADIE — ni PM ni admin — puede seguir
// moviendo sus fechas: correrlas desincroniza lo que el asignado/revisor ya
// está corrigiendo o revisando sobre el cronograma original.
async function assertDatesEditable(taskId: string) {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: {
      type: true,
      reviewRounds: { select: { id: true }, take: 1 },
      adjustmentItems: { select: { attachments: { select: { id: true }, take: 1 } } },
    },
  });
  const started =
    (task.type === "QA" && task.reviewRounds.length > 0) ||
    (task.type === "ADJUSTMENT" && task.adjustmentItems.some((i) => i.attachments.length > 0));
  if (started) {
    throw new Error("Esta tarea ya inició su procedimiento (evidencia cargada o ronda de revisión) — no se puede cambiar su fecha.");
  }
}

/**
 * Arrastre de los extremos de la barra en el Gantt (punto 6). `edge`
 * indica qué extremo se movió; el otro extremo de ESA tarea queda fijo (así
 * cambia su duración). El cliente ya clampeó visualmente el arrastre, pero
 * el servidor vuelve a validar con datos frescos antes de guardar.
 */
export async function resizeTask(
  taskId: string,
  edge: "start" | "end",
  newDateStr: string,
  expectedUpdatedAt?: string,
  actor?: Actor
) {
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
    // Punto 12: chequeo de "tarea desactualizada" primero, antes de permisos
    // — mismo orden que updateTaskStatus, para que el rechazo por choque sea
    // siempre el mismo mensaje sin importar quién esté mirando.
    assertNotStale(task, expectedUpdatedAt);
    await requireProjectAdmin(task.projectId, actor);
    await assertDatesEditable(taskId);
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
export async function moveTask(taskId: string, newStartDateStr: string, expectedUpdatedAt?: string, actor?: Actor) {
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
    assertNotStale(task, expectedUpdatedAt);
    await requireProjectAdmin(task.projectId, actor);
    await assertDatesEditable(taskId);
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
// Punto 12: `expectedUpdatedAts` trae el updatedAt que el cliente tenía
// cargado de CADA tarea del grupo al momento de arrancar el arrastre — si
// alguna ya cambió desde entonces (otro usuario la tocó mientras tanto), se
// rechaza el movimiento COMPLETO del grupo en vez de mover el resto pisando
// esa tarea a medias.
export async function moveTaskGroup(
  taskIds: string[],
  deltaDays: number,
  expectedUpdatedAts?: Record<string, string>,
  actor?: Actor
) {
  if (taskIds.length === 0 || deltaDays === 0) return { ok: true, appliedDelta: 0 };

  const projectId = (await prisma.task.findUniqueOrThrow({ where: { id: taskIds[0] } })).projectId;

  // Punto 12: chequeo de "tarea desactualizada" primero, antes de permisos —
  // mismo orden que las demás acciones de arrastre.
  if (expectedUpdatedAts) {
    const current = await prisma.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, updatedAt: true } });
    const stale = current.find((t) => expectedUpdatedAts[t.id] && expectedUpdatedAts[t.id] !== t.updatedAt.toISOString());
    if (stale) {
      return { ok: false, error: "Alguien más actualizó una de estas tareas justo ahora — se refrescó sola, fijate el estado real antes de reintentar." };
    }
  }

  try {
    await requireProjectAdmin(projectId, actor);
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

  // Punto 10: mismo bloqueo que resizeTask/moveTask, ver assertDatesEditable.
  try {
    await Promise.all(taskIds.map(assertDatesEditable));
  } catch (err) {
    return { ok: false, error: (err as Error).message };
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
