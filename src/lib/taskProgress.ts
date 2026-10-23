// Avance propio de una tarea, el que dibuja su barra en la tarjeta y en la ficha.
// Prueba, Ajuste y Aceptación no usan checklist: su avance son los puntos respondidos sobre el total,
// sin importar si la respuesta fue buena o mala. En Ajuste un cambio está respondido solo cuando el equipo
// cargó su «Después» (ver adjustmentItemAnswered; una nota, el «Antes» o un insumo no cuentan). En Prueba y Aceptación cuentan los puntos de TODAS las
// rondas (una ronda nueva sin responder baja el porcentaje: 10 de 10 pasa a 10 de 20). El resto de tipos
// sigue con los pasos del checklist.
const POINT_TYPES = ["QA", "ADJUSTMENT", "ACCEPTANCE"];

/** Un cambio de Ajuste está respondido solo con su «Después» cargado. Misma regla para la barra, la píldora,
 * el punto de estado, la vista compartida y la compuerta para completar la tarea. */
export const adjustmentItemAnswered = (item: { attachments: { kind: string }[] }) => item.attachments.some((a) => a.kind === "AFTER");

export type TaskProgress = { done: number; total: number; unit: "pasos" | "puntos" };

export function taskProgress(task: {
  type: string;
  steps: { done: boolean }[];
  adjustmentItems: { attachments: { kind: string }[] }[];
  reviewRounds: { checks: { result: string | null }[] }[];
}): TaskProgress | null {
  if (!POINT_TYPES.includes(task.type)) {
    return task.steps.length > 0 ? { done: task.steps.filter((s) => s.done).length, total: task.steps.length, unit: "pasos" } : null;
  }
  const answered =
    task.type === "ADJUSTMENT"
      ? task.adjustmentItems.map(adjustmentItemAnswered)
      : task.reviewRounds.flatMap((r) => r.checks.map((c) => c.result !== null));
  return answered.length > 0 ? { done: answered.filter(Boolean).length, total: answered.length, unit: "puntos" } : null;
}

export const progressPct = (p: { done: number; total: number }) => Math.round((p.done / p.total) * 100);

// Entregable con su evidencia ya cargada (al menos un archivo o link en «Resultado»): la misma condición
// que se exige para completarlo. La tarjeta y la ficha lo marcan con un ícono.
export function deliverableEvidenceLoaded(task: { type: string; attachments: { kind: string }[] }) {
  return task.type === "MILESTONE" && task.attachments.some((a) => a.kind === "RESULTADO");
}

export const TASK_CONTRIBUTION_SELECT = {
  type: true,
  plannedStart: true,
  plannedEnd: true,
  status: true,
  steps: { select: { done: true } },
  adjustmentItems: { select: { attachments: { select: { kind: true } } } },
  reviewRounds: { select: { outcome: true, checks: { select: { result: true } } } },
  attachments: { where: { kind: "RESULTADO" as const }, select: { kind: true } },
};

export type ContributionTask = {
  type: string;
  plannedStart: Date;
  plannedEnd: Date;
  status: string;
  steps: { done: boolean }[];
  adjustmentItems: { attachments: { kind: string }[] }[];
  reviewRounds: { outcome: unknown; checks: { result: string | null }[] }[];
  attachments: { kind: string }[];
};

export function taskInReview(task: ContributionTask) {
  if (task.status === "COMPLETED" || task.status === "RETURNED" || task.status === "NOT_STARTED") return false;
  if (task.type === "QA" || task.type === "ACCEPTANCE") return task.reviewRounds.some((r) => r.outcome === null || r.outcome === "APPROVED");
  return deliverableEvidenceLoaded(task);
}

export function taskContribution(task: ContributionTask) {
  if (task.status === "COMPLETED") return 100;
  if (task.status === "NOT_STARTED") return 0;
  if (taskInReview(task)) return 90;
  const progress = taskProgress(task);
  return progress ? Math.min(90, progressPct(progress)) : 25;
}

const DAY_MS = 86_400_000;

/** Peso de una tarea en el avance = su duración planeada en días hábiles (inicio y fin incluidos, mínimo 1):
 * una tarea de una semana aporta 5 veces lo que una de un día. */
// ponytail: cuenta lunes a viernes sin festivos; la diferencia de un festivo no cambia el reparto de forma visible.
export function taskWeight(task: { plannedStart: Date; plannedEnd: Date }) {
  const start = Math.floor(task.plannedStart.getTime() / DAY_MS);
  const end = Math.floor(task.plannedEnd.getTime() / DAY_MS);
  let days = 0;
  for (let d = start; d <= end; d++) {
    const weekday = new Date(d * DAY_MS).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days++;
  }
  return Math.max(1, days);
}

/** Suma ponderada del aporte de las tareas: avance = progressSum / weightSum, nunca más de 100. */
export function contributionSums(tasks: ContributionTask[]) {
  return tasks.reduce(
    (acc, t) => {
      const w = taskWeight(t);
      return { progressSum: acc.progressSum + taskContribution(t) * w, weightSum: acc.weightSum + w };
    },
    { progressSum: 0, weightSum: 0 },
  );
}

export const contributionPct = (s: { progressSum: number; weightSum: number }) => (s.weightSum > 0 ? Math.round(s.progressSum / s.weightSum) : 0);

/** Avance de un grupo de tareas, ponderado por duración (proyecto, fase, requerimiento). */
export const averageContribution = (tasks: ContributionTask[]) => contributionPct(contributionSums(tasks));

/** Promedio ponderado de grupos ya calculados (objetivo = sus requerimientos según el trabajo de cada uno). */
export function weightedAverage(items: { pct: number; weight: number }[]) {
  const weightSum = items.reduce((s, i) => s + i.weight, 0);
  return weightSum > 0 ? Math.round(items.reduce((s, i) => s + i.pct * i.weight, 0) / weightSum) : 0;
}

export const forecastRemainingShare = (task: ContributionTask) => (taskInReview(task) ? 0 : 1 - taskContribution(task) / 100);
