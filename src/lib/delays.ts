import { prisma } from "@/lib/prisma";
import { businessDaysBetween, todayUTC } from "@/lib/holidays";
import { mondayOnOrBefore, addDays } from "@/lib/calendarGrid";
import type { Task } from "@prisma/client";

export type TaskWithDelay = Task & {
  /** Días hábiles de atraso generados por ESTA tarea (0 si no aplica). */
  delayDays: number;
};

/**
 * Regla de responsabilidad (confirmada con el usuario): una tarea es
 * responsable de un atraso únicamente si SU PROPIA duración real superó su
 * duración planeada — nunca por haber arrancado tarde a causa de que una
 * predecesora se demoró. Si B depende de A, A se atrasa, pero B cumple su
 * propia duración una vez que arranca, el atraso completo queda en A.
 */
export async function getTaskDelayDays(
  countryCode: string,
  task: Pick<Task, "plannedStart" | "plannedEnd" | "actualStart" | "actualEnd">
) {
  if (!task.actualStart || !task.actualEnd) return 0;

  const plannedDuration = await businessDaysBetween(
    countryCode,
    task.plannedStart,
    task.plannedEnd
  );
  const actualDuration = await businessDaysBetween(
    countryCode,
    task.actualStart,
    task.actualEnd
  );

  return Math.max(0, actualDuration - plannedDuration);
}

export type TaskAlertLevel = "done" | "blocked" | "overdue" | "warning" | "onTrack";
export type TaskAlert = {
  level: TaskAlertLevel;
  /** Días hábiles ya vencidos (solo "overdue"). */
  businessDaysOverdue: number;
  /** Días hábiles que faltan hasta la fecha fin planeada (solo "warning"/"onTrack"). */
  daysRemaining: number;
};

/**
 * Alerta de agenda (punto 4): a diferencia de getTaskDelayDays (que solo
 * aplica a tareas ya COMPLETED comparando duración real vs. planeada), esto
 * mide si una tarea TODAVÍA ABIERTA ya se pasó de su fecha fin planeada, o
 * está por vencer — para pintar cards/badges antes de que el atraso ya sea
 * un hecho consumado.
 */
export async function getTaskAlert(
  countryCode: string,
  task: Pick<Task, "status" | "plannedEnd">
): Promise<TaskAlert> {
  if (task.status === "COMPLETED") return { level: "done", businessDaysOverdue: 0, daysRemaining: 0 };
  if (task.status === "BLOCKED") return { level: "blocked", businessDaysOverdue: 0, daysRemaining: 0 };

  const today = todayUTC();
  if (today > task.plannedEnd) {
    const dayAfterEnd = new Date(task.plannedEnd);
    dayAfterEnd.setUTCDate(dayAfterEnd.getUTCDate() + 1);
    const businessDaysOverdue = await businessDaysBetween(countryCode, dayAfterEnd, today);
    return { level: "overdue", businessDaysOverdue, daysRemaining: 0 };
  }

  const daysToDeadline = await businessDaysBetween(countryCode, today, task.plannedEnd);
  if (daysToDeadline <= 2) return { level: "warning", businessDaysOverdue: 0, daysRemaining: daysToDeadline };
  return { level: "onTrack", businessDaysOverdue: 0, daysRemaining: daysToDeadline };
}

export async function getProjectDelaySummary(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { tasks: { include: { assignees: { include: { user: true } } } } },
  });

  const perTask = await Promise.all(
    project.tasks.map(async (task) => ({
      task,
      delayDays: await getTaskDelayDays(project.countryCode, task),
    }))
  );

  return perTask
    .filter((t) => t.delayDays > 0)
    .map((t) => ({
      taskId: t.task.id,
      title: t.task.title,
      delayDays: t.delayDays,
      responsibles: t.task.assignees.map((a) => a.user.name),
    }));
}

export type UserPerformance = {
  userId: string;
  userName: string;
  tasksAssigned: number;
  tasksCompleted: number;
  tasksOnTime: number;
  totalDelayDays: number;
  onTimeRate: number | null;
};

/**
 * Rendimiento individual: reusa la misma regla de atraso del punto 11 (por
 * duración propia, no por fecha absoluta) para no castigar a alguien por un
 * atraso que en realidad generó otra tarea de la que dependía.
 * `projectIds` opcional acota a esos proyectos (ej. los que administra un
 * PM); sin él, es el acumulado de TODOS los proyectos — pensado para admin.
 */
export async function getUserPerformance(
  userId?: string,
  projectIds?: string[]
): Promise<UserPerformance[]> {
  const users = await prisma.user.findMany({
    where: userId ? { id: userId } : undefined,
    include: {
      assignments: {
        where: projectIds ? { task: { projectId: { in: projectIds } } } : undefined,
        include: { task: { include: { project: true } } },
      },
    },
  });

  const results: UserPerformance[] = [];

  for (const user of users) {
    let tasksCompleted = 0;
    let tasksOnTime = 0;
    let totalDelayDays = 0;

    for (const { task } of user.assignments) {
      if (task.status !== "COMPLETED") continue;
      tasksCompleted += 1;

      const delayDays = await getTaskDelayDays(task.project.countryCode, task);
      totalDelayDays += delayDays;
      if (delayDays === 0) tasksOnTime += 1;
    }

    results.push({
      userId: user.id,
      userName: user.name,
      tasksAssigned: user.assignments.length,
      tasksCompleted,
      tasksOnTime,
      totalDelayDays,
      onTimeRate: tasksCompleted > 0 ? tasksOnTime / tasksCompleted : null,
    });
  }

  return results;
}

/**
 * Cuellos de botella (punto 17): tareas no completadas de las que dependen
 * dos o más tareas sucesoras, o que ya están en riesgo alto. bottleneckReason
 * explica el PORQUÉ (qué retiene) para mostrar en un hover, no solo marcarlo.
 */
export async function getBottlenecks(projectId: string) {
  const tasks = await prisma.task.findMany({
    where: { projectId },
    include: { blocks: { include: { successor: { select: { id: true, title: true } } } } },
  });

  return tasks
    .filter((t) => t.status !== "COMPLETED" && (t.blocks.length >= 2 || t.riskLevel === "HIGH"))
    .map((t) => ({
      ...t,
      bottleneckReason:
        t.blocks.length >= 2
          ? `Retiene ${t.blocks.length} tareas: ${t.blocks.map((b) => b.successor.title).join(", ")}`
          : "Marcada con riesgo alto",
      // Para popups con link directo a cada sucesora (ver ReferencePopover) —
      // el string de arriba se deja igual por compatibilidad con lo que ya lo consume.
      blockedSuccessors: t.blocks.map((b) => ({ id: b.successor.id, title: b.successor.title })),
    }));
}

export type WorkloadRow = {
  userId: string;
  userName: string;
  notStarted: number;
  inProgress: number;
  blocked: number;
  openTotal: number;
  overdueCount: number;
};

/**
 * Carga activa por persona ("definir responsabilidades y mejorar el
 * equipo" — investigado: es el equivalente al "workload heat map" que traen
 * Jira/Asana/ClickUp): cuántas tareas ABIERTAS tiene cada quien AHORA, para
 * detectar de un vistazo quién está sobrecargado y quién tiene margen.
 * `projectIds` opcional acota a esos proyectos; sin él, across-project.
 */
export async function getTeamWorkload(projectIds?: string[]): Promise<WorkloadRow[]> {
  const users = await prisma.user.findMany({
    include: {
      assignments: {
        where: { task: { status: { not: "COMPLETED" }, projectId: projectIds ? { in: projectIds } : undefined } },
        include: { task: { include: { project: true } } },
      },
    },
  });

  const rows = await Promise.all(
    users.map(async (user) => {
      let notStarted = 0;
      let inProgress = 0;
      let blocked = 0;
      let overdueCount = 0;
      for (const { task } of user.assignments) {
        if (task.status === "NOT_STARTED") notStarted += 1;
        else if (task.status === "IN_PROGRESS") inProgress += 1;
        else if (task.status === "BLOCKED") blocked += 1;
        const alert = await getTaskAlert(task.project.countryCode, task);
        if (alert.level === "overdue") overdueCount += 1;
      }
      return {
        userId: user.id,
        userName: user.name,
        notStarted,
        inProgress,
        blocked,
        openTotal: notStarted + inProgress + blocked,
        overdueCount,
      };
    })
  );

  return rows.sort((a, b) => b.openTotal - a.openTotal);
}

export type ProjectReport = {
  totalTasks: number;
  statusBreakdown: Record<string, number>;
  riskBreakdown: Record<string, number>;
  alertBreakdown: { overdue: number; warning: number; onTrack: number; done: number; blocked: number };
  onTimeRate: number | null;
  avgDelayDays: number;
  bottlenecks: Awaited<ReturnType<typeof getBottlenecks>>;
};

/**
 * Informe general (punto: "no solo personal sino del proyecto en
 * general") — pulso del proyecto (o de TODOS, sin projectIds): mezcla de
 * estado, riesgo y alertas para sacar conclusiones sin tener que leer
 * tablero por tablero.
 */
export async function getProjectReport(projectIds?: string[]): Promise<ProjectReport> {
  const tasks = await prisma.task.findMany({
    where: { projectId: projectIds ? { in: projectIds } : undefined },
    include: { project: true },
  });

  const statusBreakdown: Record<string, number> = { NOT_STARTED: 0, IN_PROGRESS: 0, BLOCKED: 0, COMPLETED: 0 };
  const riskBreakdown: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  const alertBreakdown = { overdue: 0, warning: 0, onTrack: 0, done: 0, blocked: 0 };

  let completedCount = 0;
  let onTimeCount = 0;
  let totalDelayDays = 0;
  let delayedTaskCount = 0;

  for (const t of tasks) {
    statusBreakdown[t.status] = (statusBreakdown[t.status] ?? 0) + 1;
    riskBreakdown[t.riskLevel] = (riskBreakdown[t.riskLevel] ?? 0) + 1;

    const alert = await getTaskAlert(t.project.countryCode, t);
    alertBreakdown[alert.level] += 1;

    if (t.status === "COMPLETED") {
      completedCount += 1;
      const delay = await getTaskDelayDays(t.project.countryCode, t);
      if (delay === 0) onTimeCount += 1;
      else {
        totalDelayDays += delay;
        delayedTaskCount += 1;
      }
    }
  }

  const involvedProjectIds = projectIds ?? [...new Set(tasks.map((t) => t.projectId))];
  const bottlenecks = (await Promise.all(involvedProjectIds.map((id) => getBottlenecks(id)))).flat();

  return {
    totalTasks: tasks.length,
    statusBreakdown,
    riskBreakdown,
    alertBreakdown,
    onTimeRate: completedCount > 0 ? onTimeCount / completedCount : null,
    avgDelayDays: delayedTaskCount > 0 ? Math.round((totalDelayDays / delayedTaskCount) * 10) / 10 : 0,
    bottlenecks,
  };
}

export type TrendPoint = { weekLabel: string; completed: number };

/**
 * Tendencia de cierre por semana (estilo burndown/velocity de Jira/ClickUp,
 * investigado) — cuántas tareas se completaron cada semana de las últimas
 * `weeks`, para ver si el equipo está acelerando, estable, o frenando.
 */
export async function getCompletionTrend(projectIds?: string[], weeks = 8): Promise<TrendPoint[]> {
  const thisMonday = mondayOnOrBefore(todayUTC());
  const since = addDays(thisMonday, -(weeks - 1) * 7);

  const tasks = await prisma.task.findMany({
    where: { projectId: projectIds ? { in: projectIds } : undefined, status: "COMPLETED", actualEnd: { gte: since } },
    select: { actualEnd: true },
  });

  const buckets: TrendPoint[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = addDays(thisMonday, -i * 7);
    const weekEnd = addDays(weekStart, 6);
    const completed = tasks.filter((t) => t.actualEnd && t.actualEnd >= weekStart && t.actualEnd <= weekEnd).length;
    buckets.push({
      weekLabel: weekStart.toLocaleDateString("es-CO", { day: "2-digit", month: "short", timeZone: "UTC" }),
      completed,
    });
  }
  return buckets;
}
