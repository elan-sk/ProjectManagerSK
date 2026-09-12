import { prisma } from "@/lib/prisma";
import { addBusinessDays, businessDaysBetween, subtractBusinessDays } from "@/lib/holidays";
import type { DependencyType } from "@prisma/client";

/**
 * Holgura real (CPM): plannedStart/plannedEnd de cada tarea YA son un
 * forward-pass válido (Early Start/Early Finish) — la app los mantiene así
 * en cada edición vía propagateToSuccessors (ver actions.ts), así que acá
 * solo falta el backward pass (Late Start/Late Finish) para obtener
 * slack = LS − ES. Backward pass espejo exacto de requiredStartFor
 * (actions.ts): FINISH_TO_START exige terminar el día hábil anterior al
 * inicio más tardío de la sucesora; START_TO_START exige que el inicio más
 * tardío de esta tarea no supere el de la sucesora. Con varias sucesoras,
 * manda la más exigente (el mínimo).
 */

export type TaskSlack = { slackDays: number | null; isCritical: boolean };

export async function getProjectTaskSlack(projectId: string): Promise<Map<string, TaskSlack>> {
  const [project, tasks] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { countryCode: true } }),
    prisma.task.findMany({
      where: { projectId },
      select: { id: true, plannedStart: true, plannedEnd: true },
    }),
  ]);
  const edges = await prisma.taskDependency.findMany({
    where: { predecessor: { projectId } },
    select: { predecessorId: true, successorId: true, type: true },
  });

  // El proyecto puede no existir más (ej. link viejo, id borrado) — quien
  // llama a esto hace su propio notFound(); acá solo evitamos reventar antes.
  const countryCode = project?.countryCode ?? "CO";
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const successorsOf = new Map<string, { successorId: string; type: DependencyType }[]>();
  for (const e of edges) {
    if (!successorsOf.has(e.predecessorId)) successorsOf.set(e.predecessorId, []);
    successorsOf.get(e.predecessorId)!.push({ successorId: e.successorId, type: e.type });
  }

  if (tasks.length === 0) return new Map();
  const projectFinish = new Date(Math.max(...tasks.map((t) => t.plannedEnd.getTime())));

  const durationCache = new Map<string, number>();
  async function durationOf(taskId: string) {
    const cached = durationCache.get(taskId);
    if (cached !== undefined) return cached;
    const t = taskById.get(taskId)!;
    const d = await businessDaysBetween(countryCode, t.plannedStart, t.plannedEnd);
    durationCache.set(taskId, d);
    return d;
  }

  const lfCache = new Map<string, Date | null>();
  const inProgress = new Set<string>();

  // Late Finish de una tarea, o null si no hay ninguna holgura MEDIBLE: sin
  // ninguna sucesora real que la restrinja, "libre hasta el fin del
  // proyecto" solo tiene sentido si esta tarea ES la que define ese fin (su
  // propio plannedEnd es el más tardío del proyecto) — si no, esa distancia
  // es pura coincidencia de calendario, no una restricción causal real
  // (confirmado con el usuario: una tarea suelta de una fase temprana
  // mostraba "45d de holgura" sin ningún sentido práctico). null se propaga
  // hacia atrás: si la única sucesora de una tarea no tiene LF medible,
  // tampoco lo tiene esta.
  async function lateFinishOf(taskId: string): Promise<Date | null> {
    if (lfCache.has(taskId)) return lfCache.get(taskId)!;
    // Ciclo defensivo: no debería ocurrir (la UI no arma dependencias
    // circulares), pero si pasara, esta arista simplemente no restringe.
    if (inProgress.has(taskId)) return projectFinish;
    inProgress.add(taskId);

    const successors = successorsOf.get(taskId) ?? [];
    let lf: Date | null = null;
    for (const { successorId, type } of successors) {
      if (!taskById.has(successorId)) continue;
      const succLF = await lateFinishOf(successorId);
      if (succLF === null) continue;
      const succDuration = await durationOf(successorId);
      const succLS =
        succDuration <= 1 ? succLF : await subtractBusinessDays(countryCode, succLF, succDuration - 1);

      let candidate: Date;
      if (type === "START_TO_START") {
        const ownDuration = await durationOf(taskId);
        candidate = ownDuration <= 1 ? succLS : await addBusinessDays(countryCode, succLS, ownDuration - 1);
      } else {
        candidate = await subtractBusinessDays(countryCode, succLS, 1);
      }
      if (lf === null || candidate.getTime() < lf.getTime()) lf = candidate;
    }

    if (lf === null) {
      const t = taskById.get(taskId)!;
      lf = t.plannedEnd.getTime() === projectFinish.getTime() ? projectFinish : null;
    }

    inProgress.delete(taskId);
    lfCache.set(taskId, lf);
    return lf;
  }

  const result = new Map<string, TaskSlack>();
  for (const t of tasks) {
    const lf = await lateFinishOf(t.id);
    if (lf === null) {
      result.set(t.id, { slackDays: null, isCritical: false });
      continue;
    }
    const duration = await durationOf(t.id);
    const ls = duration <= 1 ? lf : await subtractBusinessDays(countryCode, lf, duration - 1);
    const slackDays = (await businessDaysBetween(countryCode, t.plannedStart, ls)) - 1;
    result.set(t.id, { slackDays, isCritical: slackDays === 0 });
  }
  return result;
}
