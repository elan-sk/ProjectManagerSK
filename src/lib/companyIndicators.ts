import { prisma } from "@/lib/prisma";
import { normalizeSearchText } from "@/lib/search";
import { isDeliveredOnTime, getTeamContribution } from "@/lib/delays";
import { getCommonFailureCategories, getReviewPerformance, formatHours } from "@/lib/reviewPerformance";

export type IndicatorRow = { label: string; value: number; note?: string };
export type Indicator = { key: string; title: string; kind: "bars" | "donut"; unit: string; rows: IndicatorRow[]; summary: string; reference?: number };
export type IndicatorScope = { projectIds?: string[] | null; from?: Date | null; clientId?: string | null };

export const INDICATOR_CATALOG = [
  { key: "duration", title: "Duración real vs. planeada", keywords: ["duracion", "duran", "tiempo", "tiempos", "plazo", "plazos", "cronograma", "demora", "atraso"] },
  { key: "on_time", title: "Tareas entregadas a tiempo", keywords: ["tiempo", "plazo", "entrega", "entregas", "atraso", "cumplimiento"] },
  { key: "test_rounds", title: "Rondas de pruebas hasta aprobar", keywords: ["prueba", "pruebas", "calidad", "errores", "revision", "qa"] },
  { key: "common_errors", title: "Errores más comunes en las pruebas", keywords: ["error", "errores", "calidad", "prueba", "pruebas", "fallas", "mejorar"] },
  { key: "review_times", title: "Tiempo de revisión y de corrección", keywords: ["revision", "correccion", "tiempo", "tiempos", "agilidad", "rapidez"] },
  { key: "adjustments", title: "Ajustes por proyecto", keywords: ["ajuste", "ajustes", "cambio", "cambios", "cliente", "retrabajo"] },
  { key: "acceptance_first", title: "Aceptación del cliente al primer intento", keywords: ["cliente", "clientes", "aceptacion", "satisfaccion", "aprobacion"] },
  { key: "workload", title: "Carga por persona", keywords: ["equipo", "carga", "rendimiento", "persona", "personas", "productividad", "trabajo"] },
  { key: "clients", title: "Proyectos por cliente", keywords: ["cliente", "clientes", "ventas", "crecer", "crecimiento", "conseguir"] },
] as const;

const DAY = 86_400_000;

export function daysAgo(days: number | null): Date | null {
  return days ? new Date(Date.now() - days * DAY) : null;
}
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

export async function scopeProjects(scope: IndicatorScope) {
  return prisma.project.findMany({
    where: {
      status: { not: "ARCHIVED" },
      ...(scope.projectIds ? { id: { in: scope.projectIds } } : {}),
      ...(scope.clientId ? { clientId: scope.clientId } : {}),
      ...(scope.from ? { tasks: { some: { OR: [{ plannedEnd: { gte: scope.from } }, { actualEnd: { gte: scope.from } }] } } } : {}),
    },
    select: { id: true, name: true, clientName: true, startDate: true, targetEndDate: true },
  });
}

export async function computeIndicators(scope: IndicatorScope): Promise<Indicator[]> {
  const projects = await scopeProjects(scope);
  const ids = projects.map((p) => p.id);
  const nameOf = new Map(projects.map((p) => [p.id, p.name]));
  if (ids.length === 0) return INDICATOR_CATALOG.map((c) => ({ key: c.key, title: c.title, kind: "bars", unit: "", rows: [], summary: "Sin datos." }));

  const [tasks, reviewRounds, adjustments, qaPerf, accPerf, qaErrors, accErrors, contribution] = await Promise.all([
    prisma.task.findMany({ where: { projectId: { in: ids } }, select: { projectId: true, status: true, plannedStart: true, plannedEnd: true, actualStart: true, actualEnd: true } }),
    prisma.reviewRound.findMany({ where: { task: { projectId: { in: ids } } }, select: { taskId: true, roundNumber: true, outcome: true, task: { select: { projectId: true, type: true } } } }),
    prisma.adjustmentItem.groupBy({ by: ["taskId"], where: { task: { projectId: { in: ids } } }, _count: true }),
    getReviewPerformance("QA", ids),
    getReviewPerformance("ACCEPTANCE", ids),
    getCommonFailureCategories("QA", ids, 8),
    getCommonFailureCategories("ACCEPTANCE", ids, 8),
    getTeamContribution(ids),
  ]);

  const byProject = new Map<string, typeof tasks>();
  for (const t of tasks) byProject.set(t.projectId, [...(byProject.get(t.projectId) ?? []), t]);

  const duration: IndicatorRow[] = [];
  for (const p of projects) {
    const ts = byProject.get(p.id) ?? [];
    if (ts.length === 0) continue;
    const plannedEnd = p.targetEndDate ?? new Date(Math.max(...ts.map((t) => t.plannedEnd.getTime())));
    const allDone = ts.every((t) => t.status === "COMPLETED");
    const realEnd = allDone ? new Date(Math.max(...ts.map((t) => (t.actualEnd ?? t.plannedEnd).getTime()))) : new Date();
    const planned = Math.max(1, Math.round((plannedEnd.getTime() - p.startDate.getTime()) / DAY));
    const real = Math.max(1, Math.round((realEnd.getTime() - p.startDate.getTime()) / DAY));
    const late = real - planned;
    const lateText = late > 0 ? `${late} ${late === 1 ? "día" : "días"} de atraso · ` : "";
    duration.push({ label: p.name, value: Math.round((real / planned) * 100), note: `${lateText}${real} de ${planned} días${allDone ? "" : " · en curso"}` });
  }

  const onTime: IndicatorRow[] = [];
  for (const p of projects) {
    const done = (byProject.get(p.id) ?? []).filter((t) => t.status === "COMPLETED");
    if (done.length) onTime.push({ label: p.name, value: pct(done.filter(isDeliveredOnTime).length, done.length), note: `${done.length} completadas` });
  }

  const qaRoundsByTask = new Map<string, { projectId: string; rounds: number; approved: boolean }>();
  const acceptFirst = new Map<string, { first: number; approvedFirst: number }>();
  for (const r of reviewRounds) {
    if (r.task.type === "QA") {
      const cur = qaRoundsByTask.get(r.taskId) ?? { projectId: r.task.projectId, rounds: 0, approved: false };
      cur.rounds = Math.max(cur.rounds, r.roundNumber);
      if (r.outcome === "APPROVED") cur.approved = true;
      qaRoundsByTask.set(r.taskId, cur);
    }
    if (r.task.type === "ACCEPTANCE" && r.roundNumber === 1 && r.outcome) {
      const cur = acceptFirst.get(r.task.projectId) ?? { first: 0, approvedFirst: 0 };
      cur.first++;
      if (r.outcome === "APPROVED") cur.approvedFirst++;
      acceptFirst.set(r.task.projectId, cur);
    }
  }
  const roundsByProject = new Map<string, number[]>();
  for (const v of qaRoundsByTask.values()) if (v.approved) roundsByProject.set(v.projectId, [...(roundsByProject.get(v.projectId) ?? []), v.rounds]);
  const testRounds: IndicatorRow[] = [...roundsByProject.entries()].map(([pid, rs]) => ({
    label: nameOf.get(pid) ?? "?",
    value: Math.round((rs.reduce((a, b) => a + b, 0) / rs.length) * 10) / 10,
    note: `${rs.length} pruebas aprobadas`,
  }));

  const errorCounts = new Map<string, number>();
  for (const e of [...qaErrors, ...accErrors]) errorCounts.set(e.category, (errorCounts.get(e.category) ?? 0) + e.count);
  const commonErrors = [...errorCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value }));

  const avg = (rows: { avgReviewHours: number | null; avgFixHours: number | null; roundsSubmitted: number }[], k: "avgReviewHours" | "avgFixHours") => {
    const w = rows.filter((r) => r[k] !== null && r.roundsSubmitted > 0);
    const total = w.reduce((n, r) => n + r.roundsSubmitted, 0);
    return total ? w.reduce((n, r) => n + (r[k] as number) * r.roundsSubmitted, 0) / total : null;
  };
  const reviewTimes: IndicatorRow[] = [
    { label: "Revisión de pruebas", h: avg(qaPerf, "avgReviewHours") },
    { label: "Corrección de pruebas", h: avg(qaPerf, "avgFixHours") },
    { label: "Revisión del cliente", h: avg(accPerf, "avgReviewHours") },
    { label: "Corrección tras el cliente", h: avg(accPerf, "avgFixHours") },
  ]
    .filter((r) => r.h !== null)
    .map((r) => ({ label: r.label, value: Math.round((r.h as number) * 10) / 10, note: formatHours(r.h) }));

  const taskProject = new Map(
    (await prisma.task.findMany({ where: { id: { in: adjustments.map((a) => a.taskId) } }, select: { id: true, projectId: true } })).map((t) => [t.id, t.projectId])
  );
  const adjByProject = new Map<string, number>();
  for (const a of adjustments) {
    const pid = taskProject.get(a.taskId);
    if (pid) adjByProject.set(pid, (adjByProject.get(pid) ?? 0) + a._count);
  }
  const adjustmentRows: IndicatorRow[] = [...adjByProject.entries()].map(([pid, n]) => ({ label: nameOf.get(pid) ?? "?", value: n }));

  const acceptance: IndicatorRow[] = [...acceptFirst.entries()].map(([pid, v]) => ({ label: nameOf.get(pid) ?? "?", value: pct(v.approvedFirst, v.first), note: `${v.first} aceptaciones` }));

  const workload: IndicatorRow[] = contribution.map((c) => ({ label: c.userName, value: c.openTotal, note: `${Math.round(c.completedShare)} completadas` }));

  const clientCounts = new Map<string, number>();
  for (const p of projects) clientCounts.set(p.clientName ?? "Interno", (clientCounts.get(p.clientName ?? "Interno") ?? 0) + 1);
  const clients: IndicatorRow[] = [...clientCounts.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));

  const rowsByKey: Record<string, { kind: Indicator["kind"]; unit: string; rows: IndicatorRow[]; reference?: number }> = {
    duration: { kind: "bars", unit: "%", rows: duration, reference: 100 },
    on_time: { kind: "bars", unit: "%", rows: onTime },
    test_rounds: { kind: "bars", unit: " rondas", rows: testRounds },
    common_errors: { kind: "donut", unit: "", rows: commonErrors },
    review_times: { kind: "bars", unit: " h", rows: reviewTimes },
    adjustments: { kind: "bars", unit: " ajustes", rows: adjustmentRows },
    acceptance_first: { kind: "bars", unit: "%", rows: acceptance },
    workload: { kind: "bars", unit: " abiertas", rows: workload },
    clients: { kind: "bars", unit: " proyectos", rows: clients },
  };

  return INDICATOR_CATALOG.map((c) => {
    const d = rowsByKey[c.key];
    const rows = [...d.rows].sort((a, b) => b.value - a.value);
    const summary = rows.length ? rows.map((r) => `${r.label}: ${r.value}${d.unit}${r.note ? ` (${r.note})` : ""}`).join("; ") : "Sin datos.";
    return { key: c.key, title: c.title, kind: d.kind, unit: d.unit, rows, summary, reference: d.reference };
  });
}

export function rankByIntent<T extends { key: string }>(indicators: T[], intentText: string | null): T[] {
  if (!intentText?.trim()) return indicators;
  const words = new Set(normalizeSearchText(intentText).split(/[^a-z0-9ñ]+/).filter(Boolean));
  const score = (key: string) => {
    const kw = INDICATOR_CATALOG.find((c) => c.key === key)?.keywords ?? [];
    return kw.filter((k) => [...words].some((w) => w.startsWith(k) || (k.startsWith(w) && w.length >= 4))).length;
  };
  return indicators
    .map((ind, i) => ({ ind, i, s: score(ind.key) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.ind);
}

export function indicatorsAsText(indicators: Indicator[]): string {
  return indicators.map((i) => `- ${i.title}: ${i.summary}`).join("\n");
}
