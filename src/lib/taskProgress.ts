// Avance propio de una tarea, el que dibuja su barra en la tarjeta y en la ficha.
// Prueba, Ajuste y Aceptación no usan checklist: su avance son los puntos respondidos sobre el total,
// sin importar si la respuesta fue buena o mala. En Ajuste un cambio está respondido cuando el equipo
// cargó su «Después» o una nota (la misma regla que exige completar la tarea). En Prueba y Aceptación cuentan los puntos de TODAS las
// rondas (una ronda nueva sin responder baja el porcentaje: 10 de 10 pasa a 10 de 20). El resto de tipos
// sigue con los pasos del checklist.
const POINT_TYPES = ["QA", "ADJUSTMENT", "ACCEPTANCE"];

export type TaskProgress = { done: number; total: number; unit: "pasos" | "puntos" };

export function taskProgress(task: {
  type: string;
  steps: { done: boolean }[];
  adjustmentItems: { note: string | null; attachments: { kind: string }[] }[];
  reviewRounds: { checks: { result: string | null }[] }[];
}): TaskProgress | null {
  if (!POINT_TYPES.includes(task.type)) {
    return task.steps.length > 0 ? { done: task.steps.filter((s) => s.done).length, total: task.steps.length, unit: "pasos" } : null;
  }
  const answered =
    task.type === "ADJUSTMENT"
      ? task.adjustmentItems.map((i) => Boolean(i.note) || i.attachments.some((a) => a.kind === "AFTER"))
      : task.reviewRounds.flatMap((r) => r.checks.map((c) => c.result !== null));
  return answered.length > 0 ? { done: answered.filter(Boolean).length, total: answered.length, unit: "puntos" } : null;
}

export const progressPct = (p: { done: number; total: number }) => Math.round((p.done / p.total) * 100);

// Entregable con su evidencia ya cargada (al menos un archivo o link en «Resultado»): la misma condición
// que se exige para completarlo. La tarjeta y la ficha lo marcan con un ícono.
export function deliverableEvidenceLoaded(task: { type: string; attachments: { kind: string }[] }) {
  return task.type === "MILESTONE" && task.attachments.some((a) => a.kind === "RESULTADO");
}
