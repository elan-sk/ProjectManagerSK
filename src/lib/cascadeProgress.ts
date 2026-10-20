import { prisma } from "@/lib/prisma";
import { todayUTC, businessDaysBetween } from "@/lib/holidays";
import { getProjectTaskSlack } from "@/lib/criticalPath";
import { getProjectForecast, groupDelayDays, type ProjectForecast } from "@/lib/scheduleForecast";
import type { TaskStatus } from "@prisma/client";
import { averageContribution, TASK_CONTRIBUTION_SELECT, type ContributionTask } from "@/lib/taskProgress";

/**
 * Avance en cascada de la pestaña "Definición" (punto confirmado con el
 * usuario: promedio simple). % de una fase = promedio del aporte de sus tareas
 * (spec 011, taskContribution; 0 si no tiene tareas todavía). % de un requerimiento = promedio
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

function phasePct(phase: { tasks: ContributionTask[] }) {
  return averageContribution(phase.tasks);
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

// Retraso proyectado de requerimientos y objetivos (spec 003): el peor de
// sus fases (el más negativo), no la suma — dos fases atrasadas 3 días en
// paralelo no hacen 6 días de retraso.
const worstOrNull = minOrNull;

type GroupSummary = { pct: number; atRisk: boolean; overdueTasks: TaskRef[] };

export function summarizeRequirement(
  ownTasks: ({ id: string; title: string; plannedEnd: Date } & ContributionTask)[],
  linkedPhases: GroupSummary[],
  projectId: string,
) {
  if (ownTasks.length > 0) {
    const { overdueTasks } = phaseTaskCounts({ tasks: ownTasks }, projectId);
    return { usesPhaseFallback: false, pct: phasePct({ tasks: ownTasks }), atRisk: overdueTasks.length > 0, atRiskTasks: overdueTasks };
  }
  return {
    usesPhaseFallback: true,
    pct: average(linkedPhases.map((p) => p.pct)),
    atRisk: linkedPhases.some((p) => p.atRisk),
    atRiskTasks: dedupeById(linkedPhases.flatMap((p) => p.overdueTasks)),
  };
}

export type RequirementTask = TaskRef & { status: TaskStatus; phaseId: string };
export type UnassignedTask = TaskRef & { phaseId: string };

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
  atRisk: boolean;
  usesPhaseFallback: boolean;
  atRiskTasks: TaskRef[];
  tasks: RequirementTask[];
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
  /** Spec 004: objetivo del proyecto principal al que aporta (solo en subproyectos). */
  parentObjectiveId: string | null;
  parentObjectiveTitle: string | null;
  /** Spec 004: objetivos de subproyectos que aportan a este (solo en proyectos principales). */
  contributions: { id: string; title: string; pct: number; projectId: string; projectName: string; projectIconUrl: string | null }[];
};

export async function getProjectCascadeProgress(projectId: string) {
  const [project, objectivesRaw, requirementsRaw, phasesRaw, taskSlack] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { countryCode: true } }),
    prisma.objective.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
      include: {
        requirements: { select: { id: true, title: true } },
        parentObjective: { select: { id: true, title: true } },
        // Solo de subproyectos activos (no archivados ni eliminados).
        contributions: {
          where: { project: { archivedAt: null, status: { not: "ARCHIVED" } } },
          orderBy: { order: "asc" },
          select: { id: true, title: true, projectId: true, project: { select: { name: true, iconUrl: true } } },
        },
      },
    }),
    prisma.requirement.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
      include: {
        objectives: { select: { id: true, title: true } },
        phases: { select: { id: true } },
        tasks: {
          orderBy: { plannedStart: "asc" },
          select: { id: true, title: true, plannedEnd: true, actualEnd: true, phaseId: true, ...TASK_CONTRIBUTION_SELECT },
        },
      },
    }),
    prisma.phase.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
      include: {
        tasks: { select: { id: true, title: true, plannedEnd: true, actualEnd: true, requirements: { select: { id: true } }, ...TASK_CONTRIBUTION_SELECT } },
      },
    }),
    getProjectTaskSlack(projectId),
  ]);
  // El proyecto puede no existir más (ej. link viejo, id borrado) — la
  // página que llama a esto hace su propio notFound() con el resultado;
  // acá solo evitamos que reviente antes de llegar a ese chequeo.
  const countryCode = project?.countryCode ?? "CO";
  const forecast: ProjectForecast | null = project ? await getProjectForecast(projectId) : null;

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
    tasks: ({ id: string; title: string; plannedEnd: Date; actualEnd: Date | null; requirements: { id: string }[] } & ContributionTask)[];
  }) => {
    const counts = phaseTaskCounts(p, projectId);
    return {
      id: p.id,
      name: p.name,
      pct: phasePct(p),
      atRisk: counts.overdue > 0,
      overdueTasks: counts.overdueTasks,
      requirementIds: [...new Set(p.tasks.flatMap((t) => t.requirements.map((r) => r.id)))],
      openSlackDays: phaseOpenSlack(p.tasks),
      scheduleVarianceDays: forecast ? await groupDelayDays(forecast, p.tasks) : null,
    };
  };
  const phaseIndex = new Map(
    await Promise.all(phasesRaw.map(async (p) => [p.id, await toPhaseSummary(p)] as const))
  );

  const requirementTitleById = new Map(requirementsRaw.map((r) => [r.id, r.title]));
  const requirements: RequirementSummary[] = await Promise.all(
    requirementsRaw.map(async (r) => {
      const linkedPhases = r.phases.flatMap((p) => phaseIndex.get(p.id) ?? []);
      const summary = summarizeRequirement(r.tasks, linkedPhases, projectId);
      const taskPhaseIds = new Set(r.tasks.map((t) => t.phaseId));
      const phases = summary.usesPhaseFallback ? linkedPhases : [...phaseIndex.values()].filter((p) => taskPhaseIds.has(p.id));
      return {
        id: r.id,
        title: r.title,
        description: r.description,
        ...summary,
        tasks: r.tasks.map((t) => ({ id: t.id, title: t.title, href: `/projects/${projectId}/tasks/${t.id}`, status: t.status, phaseId: t.phaseId })),
        phases,
        objectiveTitles: r.objectives.map((o) => o.title),
        objectiveIds: r.objectives.map((o) => o.id),
        openSlackDays: summary.usesPhaseFallback ? minOrNull(phases.map((p) => p.openSlackDays)) : phaseOpenSlack(r.tasks),
        scheduleVarianceDays: summary.usesPhaseFallback
          ? worstOrNull(phases.map((p) => p.scheduleVarianceDays))
          : forecast
            ? await groupDelayDays(forecast, r.tasks)
            : null,
      };
    })
  );
  const requirementPctById = new Map(requirements.map((r) => [r.id, r.pct]));
  const requirementAtRiskById = new Map(requirements.map((r) => [r.id, r.atRisk]));
  const requirementAtRiskTasksById = new Map(requirements.map((r) => [r.id, r.atRiskTasks]));
  const requirementSlackById = new Map(requirements.map((r) => [r.id, r.openSlackDays]));
  const requirementVarianceById = new Map(requirements.map((r) => [r.id, r.scheduleVarianceDays]));

  // Avance de los objetivos de subproyectos que aportan (un subproyecto no tiene subproyectos: no hay recursión infinita).
  const contributorProjectIds = [...new Set(objectivesRaw.flatMap((o) => o.contributions.map((c) => c.projectId)))];
  const contributorPct = new Map(
    (await Promise.all(contributorProjectIds.map((id) => getProjectCascadeProgress(id)))).flatMap((c) => c.objectives.map((o) => [o.id, o.pct] as const))
  );

  const objectives: ObjectiveSummary[] = objectivesRaw.map((o) => ({
    id: o.id,
    title: o.title,
    description: o.description,
    parentObjectiveId: o.parentObjective?.id ?? null,
    parentObjectiveTitle: o.parentObjective?.title ?? null,
    contributions: o.contributions.map((c) => ({ id: c.id, title: c.title, pct: contributorPct.get(c.id) ?? 0, projectId: c.projectId, projectName: c.project.name, projectIconUrl: c.project.iconUrl })),
    // Promedio simple entre sus requerimientos y los objetivos de subproyectos que aportan (RF-15).
    pct: average([...o.requirements.map((r) => requirementPctById.get(r.id) ?? 0), ...o.contributions.map((c) => contributorPct.get(c.id) ?? 0)]),
    atRiskRequirementCount: o.requirements.filter((r) => requirementAtRiskById.get(r.id)).length,
    atRiskTasks: dedupeById(o.requirements.flatMap((r) => requirementAtRiskTasksById.get(r.id) ?? [])),
    requirementTitles: o.requirements.map((r) => r.title),
    requirementIds: o.requirements.map((r) => r.id),
    openSlackDays: minOrNull(o.requirements.map((r) => requirementSlackById.get(r.id) ?? null)),
    scheduleVarianceDays: worstOrNull(o.requirements.map((r) => requirementVarianceById.get(r.id) ?? null)),
  }));

  const phases = await Promise.all(
    phasesRaw.map(async (p) => {
      const counts = phaseTaskCounts(p, projectId);
      const due = await phaseDueInfo(p, projectId, countryCode);
      const requirementIds = phaseIndex.get(p.id)?.requirementIds ?? [];
      return {
        id: p.id,
        name: p.name,
        pct: phasePct(p),
        atRisk: counts.overdue > 0,
        overdueTasks: counts.overdueTasks,
        requirementTitles: requirementIds.flatMap((id) => requirementTitleById.get(id) ?? []),
        requirementIds,
        openSlackDays: phaseOpenSlack(p.tasks),
        scheduleVarianceDays: forecast ? await groupDelayDays(forecast, p.tasks) : null,
        tasks: p.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          href: `/projects/${projectId}/tasks/${t.id}`,
          status: t.status,
          requirementIds: t.requirements.map((r) => r.id),
        })),
        taskCounts: counts,
        dueInDays: due.dueInDays,
        dueTasks: due.dueTasks,
      };
    })
  );

  const unassignedTasks: UnassignedTask[] =
    requirementsRaw.length === 0
      ? []
      : phasesRaw.flatMap((p) =>
          p.tasks
            .filter((t) => t.requirements.length === 0)
            .map((t) => ({ id: t.id, title: t.title, href: `/projects/${projectId}/tasks/${t.id}`, phaseId: p.id }))
        );

  return { objectives, requirements, phases, unassignedTasks };
}
