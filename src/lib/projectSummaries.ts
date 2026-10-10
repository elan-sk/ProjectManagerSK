import { prisma } from "@/lib/prisma";
import { getBottlenecks, getTaskAlert } from "@/lib/delays";
import { getProjectForecast } from "@/lib/scheduleForecast";
import { getProjectTaskSlack } from "@/lib/criticalPath";
import { findScheduleCollisions, type CollisionInfo } from "@/lib/collisions";
import { projectHealth, HEALTH_LABEL } from "@/lib/projectHealth";
import { projectPhase, PROJECT_PHASE_LABEL } from "@/lib/statusColors";
import { groupRows, worstVariance } from "@/lib/subprojects";
import type { Prisma } from "@prisma/client";

// Extraído de /projects/page.tsx para poder reusar EXACTAMENTE la misma
// "vista resumen" (card de proyecto con salud/progreso/alertas) en otro
// lugar (Agenda, para el bloque de un PM) sin duplicar el cálculo — un PM
// mirando "sus proyectos" en Agenda ve los mismos números que vería en
// /projects, solo que la lista de proyectos que entra está acotada por
// `where` en vez de ser siempre "todos los no archivados".
const projectInclude = {
  pm: true,
  // Spec 004: principal de un subproyecto (doble ícono cuando el subproyecto sale suelto).
  parent: { select: { id: true, name: true, iconUrl: true } },
  tasks: { select: { id: true, title: true, status: true, plannedStart: true, plannedEnd: true, actualEnd: true } },
  attachments: { orderBy: { uploadedAt: "asc" as const } },
  links: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.ProjectInclude;

// Tipo derivado de la consulta real (respeta el omit global de credenciales de lib/prisma.ts).
const findProjects = (where: Prisma.ProjectWhereInput) => prisma.project.findMany({ where, include: projectInclude, orderBy: { createdAt: "desc" } });

export type ProjectSummaryRow = {
  project: Awaited<ReturnType<typeof findProjects>>[number];
  summary: {
    overdueCount: number;
    warningCount: number;
    lateStartCount: number;
    overdueTasks: { id: string; title: string }[];
    warningTasks: { id: string; title: string }[];
    lateStartTasks: { id: string; title: string }[];
    bottlenecks: Awaited<ReturnType<typeof getBottlenecks>>;
    total: number;
    completed: number;
    health: keyof typeof HEALTH_LABEL;
    phase: keyof typeof PROJECT_PHASE_LABEL;
    collisionTasks: { id: string; title: string }[];
    openSlackDays: number | null;
    scheduleVarianceDays: number | null;
  };
};

// La detección de colisiones mira TODAS las tareas del sistema (no solo las
// de `where`) a propósito: una tarea de un proyecto fuera de esta lista
// puede seguir chocando en fechas con una persona de un proyecto que sí está
// en la lista. `canSeeCollisions` en false (miembro sin proyectos a cargo)
// se salta ese escaneo completo — no es gratis. `precomputedCollisionsById`
// es para quien YA calculó esto para otra cosa en la misma carga de página
// (ej. /projects/page.tsx lo reusa también para su "Panorama general") y no
// quiere pagar el escaneo completo dos veces.
export async function getProjectSummaryRows(
  where: Prisma.ProjectWhereInput,
  canSeeCollisions: boolean,
  precomputedCollisionsById?: Map<string, CollisionInfo[]>
): Promise<ProjectSummaryRow[]> {
  const projects = await findProjects(where);
  if (projects.length === 0) return [];

  const collisionsById =
    precomputedCollisionsById ??
    (canSeeCollisions
      ? findScheduleCollisions(
          (
            await prisma.task.findMany({
              select: {
                id: true,
                projectId: true,
                title: true,
                status: true,
                plannedStart: true,
                plannedEnd: true,
                assignees: { select: { userId: true } },
                project: { select: { name: true } },
              },
            })
          ).map((t) => ({
            id: t.id,
            projectId: t.projectId,
            projectName: t.project.name,
            title: t.title,
            status: t.status,
            plannedStart: t.plannedStart,
            plannedEnd: t.plannedEnd,
            assigneeIds: t.assignees.map((a) => a.userId),
          }))
        )
      : new Map<string, CollisionInfo[]>());

  const taskSlackByProject = new Map(
    await Promise.all(projects.map(async (p) => [p.id, await getProjectTaskSlack(p.id)] as const))
  );

  return Promise.all(
    projects.map(async (p) => {
      const alerts = await Promise.all(p.tasks.map((t) => getTaskAlert(p.countryCode, t)));
      const overdueTasks = p.tasks.filter((_, i) => alerts[i].level === "overdue").map((t) => ({ id: t.id, title: t.title }));
      const warningTasks = p.tasks.filter((_, i) => alerts[i].level === "warning").map((t) => ({ id: t.id, title: t.title }));
      const lateStartTasks = p.tasks.filter((_, i) => alerts[i].level === "lateStart").map((t) => ({ id: t.id, title: t.title }));
      const bottlenecks = await getBottlenecks(p.id);
      const total = p.tasks.length;
      const completed = p.tasks.filter((t) => t.status === "COMPLETED").length;
      const started = p.tasks.some((t) => t.status !== "NOT_STARTED");
      const collisionTasks = canSeeCollisions
        ? p.tasks.filter((t) => collisionsById.has(t.id)).map((t) => ({ id: t.id, title: t.title }))
        : [];
      const openTasks = p.tasks.filter((t) => t.status !== "COMPLETED");
      const openSlackDays =
        openTasks.length > 0
          ? (() => {
              const slack = taskSlackByProject.get(p.id)!;
              const values = openTasks.map((t) => slack.get(t.id)?.slackDays).filter((v): v is number => v != null);
              return values.length > 0 ? Math.min(...values) : null;
            })()
          : null;
      // Retraso u holgura si sigue al ritmo actual (spec 003, scheduleForecast.ts).
      const scheduleVarianceDays = (await getProjectForecast(p.id)).varianceDays;
      return {
        project: p,
        summary: {
          overdueCount: overdueTasks.length,
          warningCount: warningTasks.length,
          lateStartCount: lateStartTasks.length,
          overdueTasks,
          warningTasks,
          lateStartTasks,
          bottlenecks,
          total,
          completed,
          health: projectHealth(overdueTasks.length, total),
          phase: projectPhase(total, completed, started),
          collisionTasks,
          openSlackDays,
          scheduleVarianceDays,
        },
      };
    })
  );
}

/**
 * Spec 004 (RF-23/RF-25): una tarjeta por proyecto principal con los números de todo su grupo; sus
 * subproyectos no salen en tarjeta propia si el principal está en la lista (van en el grupito de logos).
 * Un subproyecto cuyo principal no está en la lista sale suelto (con el ícono del principal).
 */
export type GroupedSummaryRow = ProjectSummaryRow & {
  subprojects: { id: string; name: string; iconUrl: string | null; pmName: string; pmAvatarUrl: string | null; pct: number }[];
};
export function groupSummaryRows(rows: ProjectSummaryRow[]): GroupedSummaryRow[] {
  const { visible, childrenOf } = groupRows(rows.map((r) => ({ id: r.project.id, parentId: r.project.parentId, row: r })));
  return visible.map(({ id, row }) => {
    const kids = (childrenOf.get(id) ?? []).map((k) => k.row);
    if (kids.length === 0) return { ...row, subprojects: [] };
    const all = [row, ...kids].map((r) => r.summary);
    const sum = (f: (x: ProjectSummaryRow["summary"]) => number) => all.reduce((acc, x) => acc + f(x), 0);
    const total = sum((x) => x.total);
    const completed = sum((x) => x.completed);
    const overdueCount = sum((x) => x.overdueCount);
    const slack = all.map((x) => x.openSlackDays).filter((v): v is number => v !== null);
    return {
      project: row.project,
      // Mismo % que la lista «Subproyectos» de la Definición (tareas completadas / total, redondeado).
      subprojects: kids.map((k) => ({
        id: k.project.id,
        name: k.project.name,
        iconUrl: k.project.iconUrl,
        pmName: k.project.pm.name,
        pmAvatarUrl: k.project.pm.avatarUrl,
        pct: k.summary.total > 0 ? Math.round((k.summary.completed / k.summary.total) * 100) : 0,
      })),
      summary: {
        overdueCount,
        warningCount: sum((x) => x.warningCount),
        lateStartCount: sum((x) => x.lateStartCount),
        overdueTasks: all.flatMap((x) => x.overdueTasks),
        warningTasks: all.flatMap((x) => x.warningTasks),
        lateStartTasks: all.flatMap((x) => x.lateStartTasks),
        bottlenecks: all.flatMap((x) => x.bottlenecks),
        total,
        completed,
        health: projectHealth(overdueCount, total),
        phase: projectPhase(total, completed, all.some((x) => x.phase !== "PLANNING")),
        collisionTasks: all.flatMap((x) => x.collisionTasks),
        openSlackDays: slack.length > 0 ? Math.min(...slack) : null,
        scheduleVarianceDays: worstVariance(all.map((x) => x.scheduleVarianceDays)),
      },
    };
  });
}
