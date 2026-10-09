import { prisma } from "@/lib/prisma";
import { visibleProjectWhere, LIVE_PROJECT_WHERE, managedProjectWhere, type Actor } from "@/lib/permissions";
import { groupRows, worstVariance } from "@/lib/subprojects";
import { getTaskAlert, type TaskAlert } from "@/lib/delays";
import type { TaskStatus } from "@prisma/client";
import { projectHealth } from "@/lib/projectHealth";
import { isStartingSoon } from "@/lib/statusColors";
import { getProjectForecast } from "@/lib/scheduleForecast";

export type AgendaCounts = {
  lateStart: number;
  overdue: number;
  warning: number;
  blocked: number;
  unopened: number;
};

// Mismo conteo usado por los tiles de Agenda y por el resumen diario de
// WhatsApp (ver notifications.ts) — un solo lugar para no duplicar la regla.
// "lateStart" (Inicio retrasado) reemplaza al viejo conteo de "sin iniciar"
// por status crudo: una tarea NOT_STARTED cuya plannedStart todavía no llega
// no es una alerta real, así que ahora se cuenta por getTaskAlert (mismo
// nivel que ya usan /projects y el badge de la card), no por status.
export async function getAgendaCounts(userId: string): Promise<AgendaCounts> {
  const me = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, role: true } });
  const tasks = await prisma.task.findMany({
    where: { assignees: { some: { userId } }, status: { not: "COMPLETED" }, project: visibleProjectWhere(me) },
    include: {
      project: { select: { countryCode: true } },
      assignees: { where: { userId }, select: { viewedAt: true } },
    },
  });

  const items = await Promise.all(
    tasks.map(async (t) => ({ status: t.status, alert: await getTaskAlert(t.project.countryCode, t), viewedAt: t.assignees[0]?.viewedAt }))
  );
  return tallyAgendaCounts(items);
}

// La regla de conteo en sí, sin consulta: la Agenda la aplica sobre la lista
// ya filtrada para que los tiles reflejen los filtros activos. Las completadas
// nunca cuentan. viewedAt === null = asignada y nunca abierta (undefined = no
// asignada a esa persona).
export function tallyAgendaCounts(items: { status: TaskStatus; alert: TaskAlert; viewedAt: Date | null | undefined }[]): AgendaCounts {
  const counts: AgendaCounts = { lateStart: 0, overdue: 0, warning: 0, blocked: 0, unopened: 0 };
  for (const t of items) {
    if (t.status === "COMPLETED") continue;
    if (t.alert.level === "lateStart") counts.lateStart++;
    if (t.alert.level === "overdue") counts.overdue++;
    if (t.alert.level === "warning") counts.warning++;
    if (t.status === "BLOCKED") counts.blocked++;
    if (t.viewedAt === null) counts.unopened++;
  }
  return counts;
}

export type PmProjectSummary = {
  id: string;
  name: string;
  /** Spec 004: principal (si es subproyecto) y subproyectos agrupados en esta fila (solo «Mis proyectos» de Agenda). */
  parentId?: string | null;
  parent?: { name: string; iconUrl: string | null } | null;
  subprojects?: { id: string; name: string; iconUrl: string | null }[];
  iconUrl: string | null;
  total: number;
  completed: number;
  blockedCount: number;
  health: "ok" | "warn" | "bad";
  lateStartCount: number;
  overdueCount: number;
  warningCount: number;
  // Preventivo (solo tiene sentido para quien administra el proyecto): no es
  // un TaskAlertLevel, se cuenta aparte con isStartingSoon.
  startingSoonCount: number;
  /** Retraso (−) u holgura (+) proyectados en días hábiles; null sin fecha de cierre (spec 003). */
  scheduleVarianceDays: number | null;
};

// Resumen liviano por proyecto — mira TODAS las tareas del proyecto (no solo
// las asignadas al PM). Para un PM se filtra por sus proyectos; para admin se
// usa sin filtro y cubre toda la cartera activa.
// Los proyectos ocultos solo entran al resumen de su administrador responsable
// (viewer); para cualquier otra persona quedan fuera.
// `withSubprojects` (spec 004, solo Agenda): también los subproyectos de los principales que administra.
// El resumen diario de WhatsApp no lo usa: sus avisos no cambian (RF-32).
export async function getProjectsSummary(pmId?: string, viewer?: Actor, { withSubprojects = false } = {}): Promise<PmProjectSummary[]> {
  const projects = await prisma.project.findMany({
    where: { ...(pmId ? (withSubprojects ? managedProjectWhere(pmId) : { pmId }) : {}), ...(viewer ? visibleProjectWhere(viewer) : { hidden: false, ...LIVE_PROJECT_WHERE }) },
    select: {
      id: true,
      name: true,
      iconUrl: true,
      parentId: true,
      parent: { select: { name: true, iconUrl: true } },
      countryCode: true,
      tasks: { select: { status: true, plannedStart: true, plannedEnd: true } },
    },
    orderBy: { createdAt: "desc" }, // mismo orden que el resumen de Proyectos: el más reciente primero
  });

  const summaries: PmProjectSummary[] = [];
  for (const p of projects) {
    const alerts = await Promise.all(p.tasks.map((t) => getTaskAlert(p.countryCode, t)));
    const lateStartCount = alerts.filter((a) => a.level === "lateStart").length;
    const overdueCount = alerts.filter((a) => a.level === "overdue").length;
    const warningCount = alerts.filter((a) => a.level === "warning").length;
    const startingSoonCount = alerts.filter((a) => isStartingSoon(a)).length;
    const completed = p.tasks.filter((t) => t.status === "COMPLETED").length;
    summaries.push({
      id: p.id,
      name: p.name,
      parentId: p.parentId,
      parent: p.parent,
      iconUrl: p.iconUrl,
      total: p.tasks.length,
      completed,
      blockedCount: p.tasks.filter((t) => t.status === "BLOCKED").length,
      health: projectHealth(overdueCount, p.tasks.length),
      lateStartCount,
      overdueCount,
      warningCount,
      startingSoonCount,
      scheduleVarianceDays: (await getProjectForecast(p.id)).varianceDays,
    });
  }
  return summaries;
}

// Alias explícito para la Agenda y los sitios donde el alcance debe ser solo
// lo administrado por una persona.
export async function getPmProjectsSummary(userId: string, viewer?: Actor, options?: { withSubprojects?: boolean }) {
  return getProjectsSummary(userId, viewer, options);
}

/** Spec 004 (RF-24): una fila por principal con los números de su grupo; un subproyecto suelto si su principal no está. */
export function groupPmSummaries(rows: PmProjectSummary[]): PmProjectSummary[] {
  const { visible, childrenOf } = groupRows(rows.map((r) => ({ ...r, parentId: r.parentId ?? null })));
  return visible.map((r) => {
    const kids = childrenOf.get(r.id) ?? [];
    if (kids.length === 0) return { ...r, subprojects: [] };
    const all = [r, ...kids];
    const sum = (f: (x: PmProjectSummary) => number) => all.reduce((acc, x) => acc + f(x), 0);
    const total = sum((x) => x.total);
    const overdueCount = sum((x) => x.overdueCount);
    return {
      ...r,
      subprojects: kids.map((k) => ({ id: k.id, name: k.name, iconUrl: k.iconUrl })),
      total,
      completed: sum((x) => x.completed),
      blockedCount: sum((x) => x.blockedCount),
      lateStartCount: sum((x) => x.lateStartCount),
      overdueCount,
      warningCount: sum((x) => x.warningCount),
      startingSoonCount: sum((x) => x.startingSoonCount),
      health: projectHealth(overdueCount, total),
      scheduleVarianceDays: worstVariance(all.map((x) => x.scheduleVarianceDays)),
    };
  });
}
