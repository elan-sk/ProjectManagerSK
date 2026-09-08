import type { TaskStatus } from "@prisma/client";
import type { TaskAlert } from "@/lib/delays";

// Fuente única del color/etiqueta de cada estado de tarea — se usa en el
// Kanban, Gantt, red de dependencias, agenda, calendario y los botones de
// cambio de estado, para que el mismo color siempre signifique lo mismo en
// toda la app (punto de usabilidad: reforzar el color hasta que se memorice).
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  NOT_STARTED: "Sin iniciar",
  IN_PROGRESS: "En curso",
  BLOCKED: "Bloqueada",
  COMPLETED: "Completada",
};

// Vive acá (no en KanbanBoard.tsx) a propósito: KanbanBoard es "use client",
// y un Server Component que importe una constante plana desde un archivo
// "use client" recibe una referencia opaca, no el valor real — TYPE_LABEL[x]
// da `undefined` en el servidor sin ni siquiera tirar error. Este archivo no
// tiene "use client", así que sirve tanto del lado servidor como cliente.
export const TASK_TYPE_LABEL: Record<string, string> = {
  SIMPLE: "Simple",
  CHECKLIST: "Checklist",
  MILESTONE: "Hito",
  MEETING: "Reunión",
  QA: "Prueba QA",
  ADJUSTMENT: "Ajuste",
};

export const TASK_STATUS_COLOR: Record<
  TaskStatus,
  { dot: string; badge: string; solid: string; bar: string; tint: string }
> = {
  NOT_STARTED: { dot: "bg-slate-400", badge: "bg-slate-100 text-slate-700", solid: "bg-slate-700 hover:bg-slate-800", bar: "bg-slate-300", tint: "bg-white" },
  IN_PROGRESS: { dot: "bg-blue-500", badge: "bg-blue-50 text-blue-700", solid: "bg-blue-600 hover:bg-blue-700", bar: "bg-blue-500", tint: "bg-blue-50" },
  BLOCKED: { dot: "bg-red-500", badge: "bg-red-50 text-red-700", solid: "bg-red-600 hover:bg-red-700", bar: "bg-red-500", tint: "bg-red-50" },
  COMPLETED: { dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700", solid: "bg-emerald-600 hover:bg-emerald-700", bar: "bg-emerald-500", tint: "bg-emerald-50" },
};

/**
 * Fondo completo de la tarjeta/nodo (no solo una etiqueta chica): la señal
 * de atraso/vencimiento pisa el color de estado crudo, igual que en las
 * barras del Gantt — así una tarea "en curso" pero atrasada se ve roja, no
 * azul, en cualquier lugar donde aparezca.
 */
export function taskCardTint(status: TaskStatus, alertLevel: TaskAlert["level"]) {
  if (status === "COMPLETED") return TASK_STATUS_COLOR.COMPLETED.tint;
  if (status === "BLOCKED") return TASK_STATUS_COLOR.BLOCKED.tint;
  if (alertLevel === "overdue") return "bg-red-50";
  if (alertLevel === "warning") return "bg-amber-50";
  return TASK_STATUS_COLOR[status].tint;
}
