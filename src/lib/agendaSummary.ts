import { prisma } from "@/lib/prisma";
import { getTaskAlert } from "@/lib/delays";
import { projectHealth } from "@/lib/projectHealth";
import { isStartingSoon } from "@/lib/statusColors";

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
  const tasks = await prisma.task.findMany({
    where: { assignees: { some: { userId } }, status: { not: "COMPLETED" } },
    include: {
      project: { select: { countryCode: true } },
      assignees: { where: { userId }, select: { viewedAt: true } },
    },
  });

  const counts: AgendaCounts = { lateStart: 0, overdue: 0, warning: 0, blocked: 0, unopened: 0 };
  for (const t of tasks) {
    const alert = await getTaskAlert(t.project.countryCode, t);
    if (alert.level === "lateStart") counts.lateStart++;
    if (alert.level === "overdue") counts.overdue++;
    if (alert.level === "warning") counts.warning++;
    if (t.status === "BLOCKED") counts.blocked++;
    if (t.assignees[0]?.viewedAt === null) counts.unopened++;
  }
  return counts;
}

export type PmProjectSummary = {
  id: string;
  name: string;
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
};

// Resumen liviano por proyecto para un PM — a diferencia de getAgendaCounts,
// mira TODAS las tareas del proyecto (no solo las asignadas al PM). Usado
// por el bloque "Mis proyectos" de Agenda (versión compacta: ícono+nombre+
// salud+conteos, no la card completa de /projects) y por el resumen diario
// de WhatsApp — sin bottlenecks/holgura/colisiones, que ahí no hacen falta.
export async function getPmProjectsSummary(userId: string): Promise<PmProjectSummary[]> {
  const projects = await prisma.project.findMany({
    where: { pmId: userId, status: { not: "ARCHIVED" } },
    select: {
      id: true,
      name: true,
      iconUrl: true,
      countryCode: true,
      tasks: { select: { status: true, plannedStart: true, plannedEnd: true } },
    },
    orderBy: { name: "asc" },
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
      iconUrl: p.iconUrl,
      total: p.tasks.length,
      completed,
      blockedCount: p.tasks.filter((t) => t.status === "BLOCKED").length,
      health: projectHealth(overdueCount, p.tasks.length),
      lateStartCount,
      overdueCount,
      warningCount,
      startingSoonCount,
    });
  }
  return summaries;
}
