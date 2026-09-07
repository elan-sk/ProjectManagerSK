import { prisma } from "@/lib/prisma";
import { businessDaysBetween } from "@/lib/holidays";
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
 * `projectId` opcional filtra a un solo proyecto; sin él, es el acumulado
 * de todos los proyectos donde la persona tiene tareas asignadas.
 */
export async function getUserPerformance(
  userId?: string,
  projectId?: string
): Promise<UserPerformance[]> {
  const users = await prisma.user.findMany({
    where: userId ? { id: userId } : undefined,
    include: {
      assignments: {
        where: projectId ? { task: { projectId } } : undefined,
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
 * dos o más tareas sucesoras, o que ya están en riesgo alto.
 */
export async function getBottlenecks(projectId: string) {
  const tasks = await prisma.task.findMany({
    where: { projectId },
    include: { blocks: true },
  });

  return tasks.filter(
    (t) => t.status !== "COMPLETED" && (t.blocks.length >= 2 || t.riskLevel === "HIGH")
  );
}
