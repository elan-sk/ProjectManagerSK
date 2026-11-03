import { prisma } from "@/lib/prisma";
import type { TaskType } from "@prisma/client";

// Punto 2.6.2/2.6.3: métricas de Revisión para Rendimiento, enfoque PSP
// ligero — detección de errores, calidad, cumplimiento, patrones de error.
// Nunca métricas de código (líneas, tiempo por línea, etc.).

// Único tipo de tarea que usa el motor de rondas (ReviewRound/ReviewCheck)
// además de QA. Todas las funciones de este archivo reciben `taskType`
// explícito (confirmado con el usuario): Pruebas y Aceptaciones miden cosas
// distintas (revisor interno vs. cliente externo) y deben poder separarse en
// Rendimiento, así que nunca se mezclan por default.
export type ReviewTaskType = Extract<TaskType, "QA" | "ACCEPTANCE">;

// Solo mide el rol de RESPONSABLE (quien entrega) — el rol de revisor
// (checksReviewed/checksFailed sobre trabajo ajeno) se sacó porque mezclado
// en la misma fila confundía con las métricas de la propia entrega.
export type ReviewPerformance = {
  userId: string;
  userName: string;
  roundsSubmitted: number;
  tasksReviewed: number;
  roundsApprovedFirstTry: number;
  roundsReturned: number;
  // Promedios en horas corridas: envío → calificación, y devolución → reenvío. null sin datos.
  avgReviewHours: number | null;
  avgFixHours: number | null;
};

type TimedRound = { taskId: string; roundNumber: number; outcome: string | null; submittedAt: Date; closedAt: Date | null };

/** Tiempos de revisión (envío → calificación) y de corrección (devolución → reenvío de la misma tarea). */
function roundTimes(rounds: TimedRound[], allRounds: TimedRound[]) {
  const next = new Map(allRounds.map((r) => [`${r.taskId}:${r.roundNumber}`, r]));
  const hours = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 3_600_000;
  const avg = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
  const review: number[] = [];
  const fix: number[] = [];
  for (const r of rounds) {
    if (r.closedAt) review.push(hours(r.submittedAt, r.closedAt));
    const resent = next.get(`${r.taskId}:${r.roundNumber + 1}`);
    if (r.outcome === "RETURNED" && r.closedAt && resent) fix.push(hours(r.closedAt, resent.submittedAt));
  }
  return { avgReviewHours: avg(review), avgFixHours: avg(fix) };
}

/** «5 h», «menos de 1 h», «2,5 días». */
export function formatHours(h: number | null) {
  if (h === null) return "—";
  if (h < 1) return "menos de 1 h";
  if (h < 24) return `${Math.round(h)} h`;
  const days = Math.round((h / 24) * 10) / 10;
  return `${days.toLocaleString("es-CO")} ${days === 1 ? "día" : "días"}`;
}

/** Fórmulas únicas de la entrega a revisión (detalle de rendimiento y Agenda): sobre tareas revisadas, no sobre rondas. */
export function reviewRates(r: Pick<ReviewPerformance, "tasksReviewed" | "roundsApprovedFirstTry" | "roundsSubmitted"> | undefined) {
  if (!r || r.tasksReviewed === 0) return null;
  return { firstTry: r.roundsApprovedFirstTry / r.tasksReviewed, roundsPerTask: r.roundsSubmitted / r.tasksReviewed };
}

export async function getReviewPerformance(taskType: ReviewTaskType, projectIds?: string[]): Promise<ReviewPerformance[]> {
  const taskFilter = { task: { type: taskType, ...(projectIds ? { projectId: { in: projectIds } } : {}) } };

  const [rounds, users] = await Promise.all([
    prisma.reviewRound.findMany({
      where: taskFilter,
      select: { submittedById: true, roundNumber: true, outcome: true, taskId: true, submittedAt: true, closedAt: true },
    }),
    prisma.user.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
  ]);

  const byUser = new Map<string, ReviewPerformance>();
  const tasksByUser = new Map<string, Set<string>>();
  function get(userId: string, userName: string) {
    if (!byUser.has(userId)) {
      byUser.set(userId, {
        userId,
        userName,
        roundsSubmitted: 0,
        tasksReviewed: 0,
        roundsApprovedFirstTry: 0,
        roundsReturned: 0,
        avgReviewHours: null,
        avgFixHours: null,
      });
      tasksByUser.set(userId, new Set());
    }
    return byUser.get(userId)!;
  }
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  for (const round of rounds) {
    if (!nameById.has(round.submittedById)) continue;
    const entry = get(round.submittedById, nameById.get(round.submittedById) ?? "—");
    entry.roundsSubmitted++;
    tasksByUser.get(round.submittedById)!.add(round.taskId);
    if (round.outcome === "APPROVED" && round.roundNumber === 1) entry.roundsApprovedFirstTry++;
    if (round.outcome === "RETURNED") entry.roundsReturned++;
  }
  for (const [userId, tasks] of tasksByUser) byUser.get(userId)!.tasksReviewed = tasks.size;
  for (const entry of byUser.values()) Object.assign(entry, roundTimes(rounds.filter((r) => r.submittedById === entry.userId), rounds));

  return Array.from(byUser.values()).sort((a, b) => b.roundsSubmitted - a.roundsSubmitted);
}

export type ReviewPerformanceByProject = ReviewPerformance & { projectId: string; projectName: string };

/** Igual que getReviewPerformance pero desglosado por proyecto, para un único usuario. */
export async function getReviewPerformanceByProject(
  userId: string,
  taskType: ReviewTaskType,
  projectIds?: string[]
): Promise<ReviewPerformanceByProject[]> {
  const taskFilter = { task: { type: taskType, ...(projectIds ? { projectId: { in: projectIds } } : {}) } };

  const [rounds, user] = await Promise.all([
    prisma.reviewRound.findMany({
      where: { submittedById: userId, ...taskFilter },
      select: {
        roundNumber: true,
        outcome: true,
        taskId: true,
        submittedAt: true,
        closedAt: true,
        task: { select: { projectId: true, project: { select: { name: true } } } },
      },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
  ]);

  const byProject = new Map<string, ReviewPerformanceByProject>();
  function get(projectId: string, projectName: string) {
    if (!byProject.has(projectId)) {
      byProject.set(projectId, {
        projectId,
        projectName,
        userId,
        userName: user?.name ?? "—",
        roundsSubmitted: 0,
        tasksReviewed: 0,
        roundsApprovedFirstTry: 0,
        roundsReturned: 0,
        avgReviewHours: null,
        avgFixHours: null,
      });
    }
    return byProject.get(projectId)!;
  }

  const tasksByProject = new Map<string, Set<string>>();
  for (const round of rounds) {
    const entry = get(round.task.projectId, round.task.project.name);
    entry.roundsSubmitted++;
    if (!tasksByProject.has(round.task.projectId)) tasksByProject.set(round.task.projectId, new Set());
    tasksByProject.get(round.task.projectId)!.add(round.taskId);
    if (round.outcome === "APPROVED" && round.roundNumber === 1) entry.roundsApprovedFirstTry++;
    if (round.outcome === "RETURNED") entry.roundsReturned++;
  }
  for (const [projectId, tasks] of tasksByProject) byProject.get(projectId)!.tasksReviewed = tasks.size;
  for (const entry of byProject.values()) Object.assign(entry, roundTimes(rounds.filter((r) => r.task.projectId === entry.projectId), rounds));

  return Array.from(byProject.values()).sort((a, b) => a.projectName.localeCompare(b.projectName));
}

// Errores para las estadísticas: el historial (rondas devueltas que ya se reenviaron, donde la
// prueba quedó en blanco) más las pruebas que hoy siguen «Con errores». Sin doble conteo: al
// reenviar, el error pasa al historial y la prueba pierde su resultado.
async function failedChecks(taskType: ReviewTaskType, projectIds?: string[], submittedById?: string) {
  const roundFilter = { ...(submittedById ? { submittedById } : {}), task: { type: taskType, ...(projectIds ? { projectId: { in: projectIds } } : {}) } };
  const select = { category: true, responseCategory: true };
  const [history, current] = await Promise.all([
    prisma.reviewCheckFailure.findMany({ where: { reviewRound: roundFilter }, select }),
    prisma.reviewCheck.findMany({ where: { result: "FAILED", reviewRound: roundFilter }, select }),
  ]);
  return [...history, ...current];
}

/** Filas de historial de las pruebas «Con errores» de una ronda devuelta, al reenviarla. */
export function failureHistoryRows(reviewRoundId: string, checks: { id: string; category: string | null; responseCategory: string | null; note: string | null }[]) {
  return checks.map((c) => ({ reviewRoundId, checkId: c.id, category: c.category, responseCategory: c.responseCategory, note: c.note }));
}

function tally(values: (string | null)[], limit: number) {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v ?? "Sin categoría";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// Categorías de check (convenciones, responsividad, usabilidad, etc.) que
// más frecuentemente terminan en "Con errores" — para detectar patrones y
// priorizar dónde mejorar, no para señalar personas.
export async function getCommonFailureCategories(taskType: ReviewTaskType, projectIds?: string[], limit = 10) {
  return tally((await failedChecks(taskType, projectIds)).map((f) => f.category), limit);
}

// Igual pero sobre responseCategory (texto libre que escribe QUIEN ENTREGÓ describiendo su
// corrección). Al no tener vocabulario fijo, se agrupa peor que category.
export async function getCommonResponseCategories(taskType: ReviewTaskType, projectIds?: string[], limit = 10) {
  return tally((await failedChecks(taskType, projectIds)).map((f) => f.responseCategory), limit);
}

/**
 * Categorías de error y de respuesta de las rondas que ESTA persona entregó (no las que
 * revisó) — filosofía PSP: sus propios patrones de error, para identificar en qué trabajar.
 */
export async function getFailureAnalysisByUser(userId: string, taskType: ReviewTaskType, projectIds?: string[], limit = 10) {
  const failed = await failedChecks(taskType, projectIds, userId);
  return { byCategory: tally(failed.map((f) => f.category), limit), byResponseCategory: tally(failed.map((f) => f.responseCategory), limit) };
}

/**
 * "Fórmula" para sacar una conclusión accionable de byCategory, no solo
 * mostrar el gráfico: mide qué tan CONCENTRADO está el error en una sola
 * categoría (top / total). Si está concentrado (≥40%) hay un foco de mejora
 * puntual; si está repartido, el problema es más bien de proceso general
 * (revisar antes de entregar) que un tema técnico específico. Con menos de
 * 2 errores no hay suficiente historial para concluir nada todavía.
 */
export function getFailureInsight(byCategory: { category: string; count: number }[]): string | null {
  const total = byCategory.reduce((sum, c) => sum + c.count, 0);
  if (total === 0) return null;
  if (total < 2) return "Todavía es un solo caso — falta historial para identificar un patrón confiable.";

  const top = byCategory[0];
  const concentration = top.count / total;
  if (concentration >= 0.4) {
    return `El ${Math.round(concentration * 100)}% de los errores marcados están en una sola categoría ("${top.category}") — es un patrón claro, foco de mejora concreto.`;
  }
  return `Los errores se reparten entre ${byCategory.length} categorías distintas sin que ninguna domine — sugiere revisar el proceso general antes de entregar, más que un tema técnico puntual.`;
}

export type RecentTrend = { rate: number; count: number };

/**
 * Tendencia reciente de aprobación al 1er intento: de las últimas
 * `windowSize` tareas que esta persona ENTREGÓ por primera vez (una por
 * tarea, no por reenvío), qué % se aprobó sin devolución — para comparar
 * contra el % histórico y ver si está mejorando o empeorando, no solo el
 * acumulado de siempre. `null` si no hay ninguna ronda inicial cerrada
 * todavía (nada que comparar).
 */
export async function getRecentFirstPassTrend(
  userId: string,
  taskType: ReviewTaskType,
  projectIds?: string[],
  windowSize = 5
): Promise<RecentTrend | null> {
  const taskFilter = { task: { type: taskType, ...(projectIds ? { projectId: { in: projectIds } } : {}) } };
  const firstRounds = await prisma.reviewRound.findMany({
    where: { submittedById: userId, roundNumber: 1, outcome: { not: null }, ...taskFilter },
    select: { outcome: true },
    orderBy: { submittedAt: "desc" },
    take: windowSize,
  });
  if (firstRounds.length === 0) return null;
  const approved = firstRounds.filter((r) => r.outcome === "APPROVED").length;
  return { rate: approved / firstRounds.length, count: firstRounds.length };
}
