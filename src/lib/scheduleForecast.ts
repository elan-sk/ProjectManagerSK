import { prisma } from "@/lib/prisma";
import { addBusinessDays, businessDaysBetween, isBusinessDay } from "@/lib/holidays";
import { calendarDay } from "@/lib/delays";
import { scheduleVarianceText } from "@/lib/scheduleVarianceLabel";
import type { DependencyType, TaskStatus } from "@prisma/client";

/**
 * Pronóstico de cronograma (spec 003): si el proyecto sigue al ritmo actual,
 * cuándo terminaría de verdad. Las fechas planeadas ya se corren en cascada
 * cuando una tarea se COMPLETA (propagateToSuccessors), pero una tarea
 * abierta que ya se pasó de su fecha no corre nada — eso es lo que agrega acá:
 *  - en curso / bloqueada / devuelta y vencida → termina hoy + su duración;
 *  - sin iniciar con el inicio ya pasado → arranca hoy y dura lo planeado;
 *  - y sus sucesoras SIN INICIAR se corren en cadena (fin a inicio: el día
 *    hábil siguiente; inicio a inicio: junto con ella), manteniendo su duración.
 * Solo se recorre la ruta que depende de una tarea atrasada; nada se guarda.
 */

export type ForecastTask = {
  id: string;
  title: string;
  status: TaskStatus;
  plannedStart: Date;
  plannedEnd: Date;
  actualEnd: Date | null;
};
export type ForecastEdge = { predecessorId: string; successorId: string; type: DependencyType };
export type TaskForecast = { start: Date; end: Date; driverId: string | null };

const plannedDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const later = (a: Date, b: Date) => (a.getTime() >= b.getTime() ? a : b);

/** Días hábiles de `from` a `to` sin contar `from` (positivo si `to` es después). */
export async function businessDaysDiff(countryCode: string, from: Date, to: Date) {
  if (from.getTime() === to.getTime()) return 0;
  if (from < to) return (await businessDaysBetween(countryCode, from, to)) - 1;
  return -((await businessDaysBetween(countryCode, to, from)) - 1);
}

export async function forecastTasks(countryCode: string, tasks: ForecastTask[], edges: ForecastEdge[], today: Date): Promise<Map<string, TaskForecast>> {
  const firstWorkday = (await isBusinessDay(countryCode, today)) ? today : await addBusinessDays(countryCode, today, 1);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const predecessorsOf = new Map<string, ForecastEdge[]>();
  for (const e of edges) {
    if (!byId.has(e.predecessorId) || !byId.has(e.successorId)) continue;
    (predecessorsOf.get(e.successorId) ?? predecessorsOf.set(e.successorId, []).get(e.successorId)!).push(e);
  }

  const durationCache = new Map<string, number>();
  async function durationOf(t: ForecastTask) {
    if (!durationCache.has(t.id)) durationCache.set(t.id, Math.max(1, await businessDaysBetween(countryCode, t.plannedStart, t.plannedEnd)));
    return durationCache.get(t.id)!;
  }
  const endFrom = async (start: Date, duration: number) => (duration <= 1 ? start : addBusinessDays(countryCode, start, duration - 1));

  // Fin propio de cada tarea, sin mirar a sus predecesoras.
  async function own(t: ForecastTask): Promise<TaskForecast> {
    const start = plannedDay(t.plannedStart);
    const end = plannedDay(t.plannedEnd);
    if (t.status === "COMPLETED") return { start, end: t.actualEnd ? calendarDay(t.actualEnd) : end, driverId: null };
    if (t.status === "NOT_STARTED") {
      if (start < today) return { start: firstWorkday, end: await endFrom(firstWorkday, await durationOf(t)), driverId: t.id };
      return { start, end, driverId: null };
    }
    if (end < today) return { start, end: await addBusinessDays(countryCode, today, await durationOf(t)), driverId: t.id };
    return { start, end, driverId: null };
  }

  const result = new Map<string, TaskForecast>();
  const visiting = new Set<string>();
  async function resolve(id: string): Promise<TaskForecast> {
    const cached = result.get(id);
    if (cached) return cached;
    const t = byId.get(id)!;
    const base = await own(t);
    // Una tarea ya arrancada (o completada) no se re-planifica; un ciclo se corta.
    if (t.status !== "NOT_STARTED" || visiting.has(id)) {
      result.set(id, base);
      return base;
    }
    visiting.add(id);
    let { start, driverId } = base;
    for (const e of predecessorsOf.get(id) ?? []) {
      const pred = await resolve(e.predecessorId);
      if (pred.driverId === null) continue; // la predecesora no se corrió: el plan ya la contempla
      const required = e.type === "START_TO_START" ? pred.start : await addBusinessDays(countryCode, pred.end, 1);
      if (required > start) {
        start = required;
        driverId = pred.driverId;
      }
    }
    visiting.delete(id);
    const end = start === base.start ? base.end : later(base.end, await endFrom(start, await durationOf(t)));
    const forecast = { start, end, driverId };
    result.set(id, forecast);
    return forecast;
  }

  for (const t of tasks) await resolve(t.id);
  return result;
}

export type ProjectForecast = {
  /** Fin si sigue al ritmo actual; null sin tareas. */
  projectedEnd: Date | null;
  /** Cierre comprometido del proyecto. */
  targetEndDate: Date | null;
  /** Días hábiles contra el cierre: + holgura, − retraso, null sin cierre o sin tareas. */
  varianceDays: number | null;
  /** Tareas atrasadas que empujan el fin proyectado (vacío si nada empuja). */
  drivers: { id: string; title: string }[];
  tasks: Map<string, TaskForecast>;
  countryCode: string;
};

export async function getProjectForecast(projectId: string): Promise<ProjectForecast> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      countryCode: true,
      targetEndDate: true,
      tasks: { select: { id: true, title: true, status: true, plannedStart: true, plannedEnd: true, actualEnd: true } },
    },
  });
  const edges = await prisma.taskDependency.findMany({
    where: { successor: { projectId } },
    select: { predecessorId: true, successorId: true, type: true },
  });
  return buildProjectForecast(project.countryCode, project.targetEndDate, project.tasks, edges, calendarDay(new Date()));
}

export async function buildProjectForecast(
  countryCode: string,
  targetEndDate: Date | null,
  tasks: ForecastTask[],
  edges: ForecastEdge[],
  today: Date
): Promise<ProjectForecast> {
  const forecast = await forecastTasks(countryCode, tasks, edges, today);
  if (tasks.length === 0) return { projectedEnd: null, targetEndDate, varianceDays: null, drivers: [], tasks: forecast, countryCode };
  const projectedEnd = new Date(Math.max(...[...forecast.values()].map((f) => f.end.getTime())));
  const titleOf = new Map(tasks.map((t) => [t.id, t.title]));
  const driverIds = new Set(
    [...forecast.values()].filter((f) => f.end.getTime() === projectedEnd.getTime() && f.driverId).map((f) => f.driverId!)
  );
  return {
    projectedEnd,
    targetEndDate,
    varianceDays: targetEndDate ? await businessDaysDiff(countryCode, projectedEnd, plannedDay(targetEndDate)) : null,
    drivers: [...driverIds].map((id) => ({ id, title: titleOf.get(id) ?? "" })),
    tasks: forecast,
    countryCode,
  };
}

/**
 * Retraso proyectado de un grupo de tareas (Fase): cuánto se corre su fin
 * contra el fin que tiene hoy en el cronograma. Su fin actual ya incluye lo
 * ganado o perdido al completar tareas, así que solo puede dar retraso
 * (negativo) o 0; null si el grupo no tiene tareas.
 */
export async function groupDelayDays(
  forecast: ProjectForecast,
  tasks: { id: string; status: string; plannedEnd: Date; actualEnd: Date | null }[]
): Promise<number | null> {
  if (tasks.length === 0) return null;
  const currentEnd = Math.max(...tasks.map((t) => (t.status === "COMPLETED" && t.actualEnd ? calendarDay(t.actualEnd) : plannedDay(t.plannedEnd)).getTime()));
  const projected = Math.max(...tasks.map((t) => forecast.tasks.get(t.id)?.end.getTime() ?? currentEnd));
  if (projected <= currentEnd) return 0;
  return -(await businessDaysDiff(forecast.countryCode, new Date(currentEnd), new Date(projected)));
}

/** Datos del pronóstico para el bot y la API. */
export function scheduleForApi(forecast: ProjectForecast) {
  return {
    projectedEnd: forecast.projectedEnd?.toISOString().slice(0, 10) ?? null,
    targetEndDate: forecast.targetEndDate?.toISOString().slice(0, 10) ?? null,
    varianceBusinessDays: forecast.varianceDays,
    label: forecast.varianceDays === null ? "Sin fecha de cierre" : scheduleVarianceText(forecast.varianceDays),
    delayingTasks: forecast.drivers,
  };
}
