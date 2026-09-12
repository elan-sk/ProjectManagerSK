import { prisma } from "@/lib/prisma";
import { todayUTC, businessDaysBetween } from "@/lib/holidays";
import { getProjectTaskSlack } from "@/lib/criticalPath";
import { getTaskScheduleVariance } from "@/lib/delays";

/**
 * Avance en cascada de la pestaña "Definición" (punto confirmado con el
 * usuario: promedio simple). % de una fase = tareas completadas / total de
 * esa fase (0 si no tiene tareas todavía). % de un requerimiento = promedio
 * del % de sus fases vinculadas (0 si no tiene ninguna vinculada todavía).
 * % de un objetivo = promedio del % de sus requerimientos vinculados.
 *
 * El riesgo ("atrasada") cascada con el mismo criterio: una fase está en
 * riesgo si tiene tareas vencidas; un requerimiento si alguna de sus fases
 * está en riesgo; un objetivo si alguno de sus requerimientos lo está. Cada
 * nivel expone además la lista real de tareas vencidas (con link directo)
 * para los popups de "ver a qué tareas se refiere esto".
 */

export type TaskRef = { id: string; title: string; href: string };

function dedupeById(items: TaskRef[]): TaskRef[] {
  const seen = new Set<string>();
  return items.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

function phasePct(phase: { tasks: { status: string }[] }) {
  if (phase.tasks.length === 0) return 0;
  const completed = phase.tasks.filter((t) => t.status === "COMPLETED").length;
  return Math.round((completed / phase.tasks.length) * 100);
}

// Misma definición de "atrasada" que getTaskAlert (src/lib/delays.ts): abierta
// (ni completada ni bloqueada) y ya pasó su fecha fin planeada. Se reimplementa
// sin businessDaysBetween/countryCode a propósito — acá solo hace falta el
// conteo, no los días hábiles exactos de atraso, así que se evita el viaje a
// la tabla de feriados por cada tarea.
function phaseTaskCounts(
  phase: { tasks: { id: string; title: string; status: string; plannedEnd: Date }[] },
  projectId: string
) {
  const today = todayUTC();
  const completed = phase.tasks.filter((t) => t.status === "COMPLETED").length;
  const overdueTasks: TaskRef[] = phase.tasks
    .filter((t) => t.status !== "COMPLETED" && t.status !== "BLOCKED" && t.plannedEnd < today)
    .map((t) => ({ id: t.id, title: t.title, href: `/projects/${projectId}/tasks/${t.id}` }));
  return { completed, total: phase.tasks.length, overdue: overdueTasks.length, overdueTasks };
}

// "Vence en Nd" de la fase = días hábiles hasta el plannedEnd más lejano de
// sus tareas abiertas (mismo criterio que getTaskAlert, nivel "onTrack").
// null si la fase no tiene tareas abiertas, o si ya está atrasada (ese caso
// ya lo cubre el badge de "N atrasada(s)", no hace falta duplicarlo).
async function phaseDueInfo(
  phase: { tasks: { id: string; title: string; status: string; plannedEnd: Date }[] },
  projectId: string,
  countryCode: string
) {
  const openTasks = phase.tasks.filter((t) => t.status !== "COMPLETED" && t.status !== "BLOCKED");
  if (openTasks.length === 0) return { dueInDays: null, dueTasks: [] as TaskRef[] };
  const today = todayUTC();
  const maxEnd = Math.max(...openTasks.map((t) => t.plannedEnd.getTime()));
  if (maxEnd < today.getTime()) return { dueInDays: null, dueTasks: [] as TaskRef[] };
  const dueTasks = openTasks
    .filter((t) => t.plannedEnd.getTime() === maxEnd)
    .map((t) => ({ id: t.id, title: t.title, href: `/projects/${projectId}/tasks/${t.id}` }));
  return { dueInDays: await businessDaysBetween(countryCode, today, new Date(maxEnd)), dueTasks };
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function minOrNull(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null);
  return valid.length > 0 ? Math.min(...valid) : null;
}

// A diferencia de openSlackDays (se queda con la restricción más ajustada,
// un mínimo), la holgura/retraso real ACUMULA a lo largo de la cadena de
// tareas ya cerradas — por eso sumOrNull en vez de minOrNull. null = todavía
// ninguna tarea completada en ese alcance (no "0 días").
function sumOrNull(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null);
  return valid.length > 0 ? valid.reduce((sum, v) => sum + v, 0) : null;
}

// Holgura/retraso acumulado de una fase: suma de getTaskScheduleVariance
// (plannedEnd − actualEnd) de sus tareas ya COMPLETED. null si ninguna tarea
// de la fase se completó todavía.
async function phaseScheduleVariance(
  tasks: { status: string; plannedEnd: Date; actualEnd: Date | null }[],
  countryCode: string
): Promise<number | null> {
  const completed = tasks.filter((t) => t.status === "COMPLETED" && t.actualEnd);
  if (completed.length === 0) return null;
  const variances = await Promise.all(completed.map((t) => getTaskScheduleVariance(countryCode, t)));
  return variances.reduce((sum: number, v) => sum + (v ?? 0), 0);
}

export type PhaseSummary = {
  id: string;
  name: string;
  pct: number;
  atRisk: boolean;
  overdueTasks: TaskRef[];
  requirementIds: string[];
  openSlackDays: number | null;
  scheduleVarianceDays: number | null;
};
export type RequirementSummary = {
  id: string;
  title: string;
  description: string | null;
  pct: number;
  atRiskPhaseCount: number;
  atRiskTasks: TaskRef[];
  phases: PhaseSummary[];
  objectiveTitles: string[];
  objectiveIds: string[];
  openSlackDays: number | null;
  scheduleVarianceDays: number | null;
};
export type ObjectiveSummary = {
  id: string;
  title: string;
  description: string | null;
  pct: number;
  atRiskRequirementCount: number;
  atRiskTasks: TaskRef[];
  requirementTitles: string[];
  requirementIds: string[];
  openSlackDays: number | null;
  scheduleVarianceDays: number | null;
};

export async function getProjectCascadeProgress(projectId: string) {
  const [project, objectivesRaw, requirementsRaw, phasesRaw, taskSlack] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { countryCode: true } }),
    prisma.objective.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
      include: { requirements: { select: { id: true, title: true } } },
    }),
    prisma.requirement.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
      include: {
        objectives: { select: { id: true, title: true } },
        phases: {
          include: {
            tasks: { select: { id: true, title: true, status: true, plannedEnd: true, actualEnd: true } },
            requirements: { select: { id: true } },
          },
        },
      },
    }),
    prisma.phase.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
      include: {
        tasks: { select: { id: true, title: true, status: true, plannedEnd: true, actualEnd: true } },
        requirements: { select: { id: true, title: true } },
      },
    }),
    getProjectTaskSlack(projectId),
  ]);
  // El proyecto puede no existir más (ej. link viejo, id borrado) — la
  // página que llama a esto hace su propio notFound() con el resultado;
  // acá solo evitamos que reviente antes de llegar a ese chequeo.
  const countryCode = project?.countryCode ?? "CO";

  // Holgura de una fase = la más ajustada (mínima) entre sus tareas abiertas
  // (COMPLETED ya no aporta margen relevante); null si no tiene ninguna.
  function phaseOpenSlack(tasks: { id: string; status: string }[]) {
    return minOrNull(
      tasks.filter((t) => t.status !== "COMPLETED").map((t) => taskSlack.get(t.id)?.slackDays ?? null)
    );
  }

  const toPhaseSummary = async (p: {
    id: string;
    name: string;
    tasks: { id: string; title: string; status: string; plannedEnd: Date; actualEnd: Date | null }[];
    requirements: { id: string }[];
  }) => {
    const counts = phaseTaskCounts(p, projectId);
    return {
      id: p.id,
      name: p.name,
      pct: phasePct(p),
      atRisk: counts.overdue > 0,
      overdueTasks: counts.overdueTasks,
      requirementIds: p.requirements.map((r) => r.id),
      openSlackDays: phaseOpenSlack(p.tasks),
      scheduleVarianceDays: await phaseScheduleVariance(p.tasks, countryCode),
    };
  };
  const phaseIndex = new Map(
    await Promise.all(phasesRaw.map(async (p) => [p.id, await toPhaseSummary(p)] as const))
  );

  const requirements: RequirementSummary[] = await Promise.all(
    requirementsRaw.map(async (r) => {
      const phases = await Promise.all(r.phases.map(async (p) => phaseIndex.get(p.id) ?? (await toPhaseSummary(p))));
      return {
        id: r.id,
        title: r.title,
        description: r.description,
        pct: average(phases.map((p) => p.pct)),
        atRiskPhaseCount: phases.filter((p) => p.atRisk).length,
        atRiskTasks: dedupeById(phases.flatMap((p) => p.overdueTasks)),
        phases,
        objectiveTitles: r.objectives.map((o) => o.title),
        objectiveIds: r.objectives.map((o) => o.id),
        openSlackDays: minOrNull(phases.map((p) => p.openSlackDays)),
        scheduleVarianceDays: sumOrNull(phases.map((p) => p.scheduleVarianceDays)),
      };
    })
  );
  const requirementPctById = new Map(requirements.map((r) => [r.id, r.pct]));
  const requirementAtRiskById = new Map(requirements.map((r) => [r.id, r.atRiskPhaseCount > 0]));
  const requirementAtRiskTasksById = new Map(requirements.map((r) => [r.id, r.atRiskTasks]));
  const requirementSlackById = new Map(requirements.map((r) => [r.id, r.openSlackDays]));
  const requirementVarianceById = new Map(requirements.map((r) => [r.id, r.scheduleVarianceDays]));

  const objectives: ObjectiveSummary[] = objectivesRaw.map((o) => ({
    id: o.id,
    title: o.title,
    description: o.description,
    pct: average(o.requirements.map((r) => requirementPctById.get(r.id) ?? 0)),
    atRiskRequirementCount: o.requirements.filter((r) => requirementAtRiskById.get(r.id)).length,
    atRiskTasks: dedupeById(o.requirements.flatMap((r) => requirementAtRiskTasksById.get(r.id) ?? [])),
    requirementTitles: o.requirements.map((r) => r.title),
    requirementIds: o.requirements.map((r) => r.id),
    openSlackDays: minOrNull(o.requirements.map((r) => requirementSlackById.get(r.id) ?? null)),
    scheduleVarianceDays: sumOrNull(o.requirements.map((r) => requirementVarianceById.get(r.id) ?? null)),
  }));

  const phases = await Promise.all(
    phasesRaw.map(async (p) => {
      const counts = phaseTaskCounts(p, projectId);
      const due = await phaseDueInfo(p, projectId, countryCode);
      return {
        id: p.id,
        name: p.name,
        pct: phasePct(p),
        atRisk: counts.overdue > 0,
        overdueTasks: counts.overdueTasks,
        requirementTitles: p.requirements.map((r) => r.title),
        requirementIds: p.requirements.map((r) => r.id),
        openSlackDays: phaseOpenSlack(p.tasks),
        scheduleVarianceDays: await phaseScheduleVariance(p.tasks, countryCode),
        tasks: p.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          href: `/projects/${projectId}/tasks/${t.id}`,
          status: t.status,
        })),
        taskCounts: counts,
        dueInDays: due.dueInDays,
        dueTasks: due.dueTasks,
      };
    })
  );

  return { objectives, requirements, phases };
}
