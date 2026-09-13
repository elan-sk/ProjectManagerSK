import { prisma } from "@/lib/prisma";
import { getBottlenecks, getTaskAlert, getTaskScheduleVariance } from "@/lib/delays";
import { getProjectTaskSlack } from "@/lib/criticalPath";
import { findScheduleCollisions, type CollisionInfo } from "@/lib/collisions";
import { projectHealth, HEALTH_LABEL } from "@/lib/projectHealth";
import { projectPhase, PROJECT_PHASE_LABEL } from "@/lib/statusColors";
import type { Prisma } from "@prisma/client";

// Extraído de /projects/page.tsx para poder reusar EXACTAMENTE la misma
// "vista resumen" (card de proyecto con salud/progreso/alertas) en otro
// lugar (Agenda, para el bloque de un PM) sin duplicar el cálculo — un PM
// mirando "sus proyectos" en Agenda ve los mismos números que vería en
// /projects, solo que la lista de proyectos que entra está acotada por
// `where` en vez de ser siempre "todos los no archivados".
const projectInclude = {
  pm: true,
  tasks: { select: { id: true, title: true, status: true, plannedStart: true, plannedEnd: true, actualEnd: true } },
  attachments: { orderBy: { uploadedAt: "asc" as const } },
  links: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.ProjectInclude;

export type ProjectSummaryRow = {
  project: Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;
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
  const projects = await prisma.project.findMany({ where, include: projectInclude, orderBy: { createdAt: "desc" } });
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
      const completedWithActualEnd = p.tasks.filter((t) => t.status === "COMPLETED" && t.actualEnd);
      const scheduleVarianceDays =
        completedWithActualEnd.length > 0
          ? (
              await Promise.all(completedWithActualEnd.map((t) => getTaskScheduleVariance(p.countryCode, t)))
            ).reduce((sum: number, v) => sum + (v ?? 0), 0)
          : null;
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
