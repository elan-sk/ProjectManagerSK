import { prisma } from "@/lib/prisma";

// Punto 2.6.2/2.6.3: métricas de Revisión para Rendimiento, enfoque PSP
// ligero — detección de errores, calidad, cumplimiento, patrones de error.
// Nunca métricas de código (líneas, tiempo por línea, etc.).

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
};

export async function getReviewPerformance(projectIds?: string[]): Promise<ReviewPerformance[]> {
  const taskFilter = projectIds ? { task: { projectId: { in: projectIds } } } : {};

  const [rounds, users] = await Promise.all([
    prisma.reviewRound.findMany({
      where: taskFilter,
      select: { submittedById: true, roundNumber: true, outcome: true, taskId: true },
    }),
    prisma.user.findMany({ select: { id: true, name: true } }),
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
      });
      tasksByUser.set(userId, new Set());
    }
    return byUser.get(userId)!;
  }
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  for (const round of rounds) {
    const entry = get(round.submittedById, nameById.get(round.submittedById) ?? "—");
    entry.roundsSubmitted++;
    tasksByUser.get(round.submittedById)!.add(round.taskId);
    if (round.outcome === "APPROVED" && round.roundNumber === 1) entry.roundsApprovedFirstTry++;
    if (round.outcome === "RETURNED") entry.roundsReturned++;
  }
  for (const [userId, tasks] of tasksByUser) byUser.get(userId)!.tasksReviewed = tasks.size;

  return Array.from(byUser.values()).sort((a, b) => b.roundsSubmitted - a.roundsSubmitted);
}

export type ReviewPerformanceByProject = ReviewPerformance & { projectId: string; projectName: string };

/** Igual que getReviewPerformance pero desglosado por proyecto, para un único usuario. */
export async function getReviewPerformanceByProject(
  userId: string,
  projectIds?: string[]
): Promise<ReviewPerformanceByProject[]> {
  const taskFilter = projectIds ? { task: { projectId: { in: projectIds } } } : {};

  const [rounds, user] = await Promise.all([
    prisma.reviewRound.findMany({
      where: { submittedById: userId, ...taskFilter },
      select: {
        roundNumber: true,
        outcome: true,
        taskId: true,
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

  return Array.from(byProject.values()).sort((a, b) => a.projectName.localeCompare(b.projectName));
}

// Categorías de check (convenciones, responsividad, usabilidad, etc.) que
// más frecuentemente terminan en "Con errores" — para detectar patrones y
// priorizar dónde mejorar, no para señalar personas.
export async function getCommonFailureCategories(projectIds?: string[], limit = 10): Promise<{ category: string; count: number }[]> {
  const taskFilter = projectIds ? { task: { projectId: { in: projectIds } } } : {};
  const failed = await prisma.reviewCheck.findMany({
    where: { result: "FAILED", reviewRound: taskFilter },
    select: { category: true },
  });

  const counts = new Map<string, number>();
  for (const c of failed) {
    const key = c.category ?? "Sin categoría";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// Igual que getCommonFailureCategories pero sobre responseCategory (texto
// libre que escribe QUIEN ENTREGÓ, no el revisor, describiendo su propia
// corrección) en vez de category (la categoría fija de la plantilla, elegida
// al armar la ronda) — otro ángulo de qué se repite, nunca analizado hasta
// ahora en ningún informe. Ojo: al ser texto libre sin vocabulario fijo, es
// normal que se agrupe peor que category (cada quien lo redacta distinto).
export async function getCommonResponseCategories(projectIds?: string[], limit = 10): Promise<{ category: string; count: number }[]> {
  const taskFilter = projectIds ? { task: { projectId: { in: projectIds } } } : {};
  const failed = await prisma.reviewCheck.findMany({
    where: { result: "FAILED", reviewRound: taskFilter },
    select: { responseCategory: true },
  });

  const counts = new Map<string, number>();
  for (const c of failed) {
    const key = c.responseCategory ?? "Sin categoría";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Categorías de error (de plantilla) y de respuesta (corrección puntual) de
 * los checks FAILED en las rondas que ESTA persona entregó (no las que
 * revisó) — filosofía PSP: sus propios patrones de error, para identificar
 * en qué trabajar.
 */
export async function getFailureAnalysisByUser(
  userId: string,
  projectIds?: string[],
  limit = 10
): Promise<{ byCategory: { category: string; count: number }[]; byResponseCategory: { category: string; count: number }[] }> {
  const taskFilter = projectIds ? { task: { projectId: { in: projectIds } } } : {};
  const failed = await prisma.reviewCheck.findMany({
    where: { result: "FAILED", reviewRound: { submittedById: userId, ...taskFilter } },
    select: { category: true, responseCategory: true },
  });

  function tally(values: (string | null)[]) {
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

  return {
    byCategory: tally(failed.map((f) => f.category)),
    byResponseCategory: tally(failed.map((f) => f.responseCategory)),
  };
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
  projectIds?: string[],
  windowSize = 5
): Promise<RecentTrend | null> {
  const taskFilter = projectIds ? { task: { projectId: { in: projectIds } } } : {};
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
