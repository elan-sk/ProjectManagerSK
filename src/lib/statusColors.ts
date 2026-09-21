import type { TaskStatus, NotificationType } from "@prisma/client";
import type { TaskAlert } from "@/lib/delays";

// Vive acá (no en delays.ts) por el mismo motivo que TASK_TYPE_LABEL de más
// abajo: delays.ts importa `prisma` en la cabecera, así que cualquier import
// de valor desde ahí en un "use client" (KanbanBoard.tsx necesita esto para
// el indicador "Empieza en Xd") arrastraría el cliente de Prisma al bundle
// del navegador. Este archivo no tiene esa importación, así que es seguro
// para ambos lados.
export const STARTING_SOON_THRESHOLD_DAYS = 2;

export function isStartingSoon(alert: Pick<TaskAlert, "daysUntilStart">) {
  return alert.daysUntilStart !== null && alert.daysUntilStart <= STARTING_SOON_THRESHOLD_DAYS;
}

// Fuente única del color/etiqueta de cada estado de tarea — se usa en el
// Kanban, Gantt, red de dependencias, agenda, calendario y los botones de
// cambio de estado, para que el mismo color siempre signifique lo mismo en
// toda la app (punto de usabilidad: reforzar el color hasta que se memorice).
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  NOT_STARTED: "Sin iniciar",
  IN_PROGRESS: "En curso",
  BLOCKED: "Bloqueada",
  COMPLETED: "Completada",
  RETURNED: "Devuelta",
};

// Vive acá (no en KanbanBoard.tsx) a propósito: KanbanBoard es "use client",
// y un Server Component que importe una constante plana desde un archivo
// "use client" recibe una referencia opaca, no el valor real — TYPE_LABEL[x]
// da `undefined` en el servidor sin ni siquiera tirar error. Este archivo no
// tiene "use client", así que sirve tanto del lado servidor como cliente.
// Punto 2 (unificación): CHECKLIST y MEETING dejaron de ser tipos — el
// nombre interno del enum (MILESTONE, QA) no cambió para no migrar datos
// existentes, solo la etiqueta visible.
export const TASK_TYPE_LABEL: Record<string, string> = {
  SIMPLE: "Simple",
  MILESTONE: "Entregable",
  QA: "Prueba",
  ADJUSTMENT: "Ajuste",
  ACCEPTANCE: "Aceptación",
};

// Un mismo color por nivel de la jerarquía de Definición (Objetivo →
// Requerimiento → Fase → Tarea), para poder distinguir de un vistazo qué es
// qué en la pestaña Definición, incluso cuando un panel referencia el nivel
// de abajo dentro de sus filas (ej. las Fases dentro de un Objetivo).
// Botones de acción de la pestaña Definición (+ Objetivo, Editar, Eliminar…):
// mismo tamaño y forma en todos, para que no queden desparejos.
const DEFINITION_ACTION_BASE = "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 disabled:opacity-60";
export const DEFINITION_ACTION_BTN = `${DEFINITION_ACTION_BASE} hover:bg-slate-50 hover:text-slate-900`;
export const DEFINITION_ACTION_BTN_DANGER = `${DEFINITION_ACTION_BASE} hover:border-red-300 hover:bg-red-50 hover:text-red-600`;

export const DEFINITION_LEVEL_COLOR = {
  OBJECTIVE: { border: "border-violet-300", text: "text-violet-700", bg: "bg-violet-50", dot: "bg-violet-500" },
  REQUIREMENT: { border: "border-sky-300", text: "text-sky-700", bg: "bg-sky-50", dot: "bg-sky-500" },
  PHASE: { border: "border-teal-300", text: "text-teal-700", bg: "bg-teal-50", dot: "bg-teal-500" },
  TASK: { border: "border-fuchsia-300", text: "text-fuchsia-700", bg: "bg-fuchsia-50", dot: "bg-fuchsia-500" },
} as const;

// El status del proyecto (PLANNING/ACTIVE/.../COMPLETED en el schema) no lo
// actualiza ningún flujo de la app — queda pegado en PLANNING para siempre
// (bug real detectado por el usuario). La "fase" real se calcula acá a
// partir del progreso real de las tareas en vez de leer ese campo, así
// siempre refleja la realidad sin depender de que alguien lo actualice a
// mano — usado por projects/page.tsx y por las tools de Chontatec
// (chontatecTools.ts) para no exponer nunca el campo crudo, que sería
// engañoso (diría "PLANNING" para un proyecto ya terminado).
export const PROJECT_PHASE_LABEL = { PLANNING: "Planeación", ACTIVE: "Activo", COMPLETED: "Completado" } as const;
export function projectPhase(total: number, completed: number, started: boolean): keyof typeof PROJECT_PHASE_LABEL {
  if (total === 0 || !started) return "PLANNING";
  if (completed === total) return "COMPLETED";
  return "ACTIVE";
}

export const TASK_STATUS_COLOR: Record<
  TaskStatus,
  { dot: string; badge: string; solid: string; bar: string; tint: string }
> = {
  // NOT_STARTED e IN_PROGRESS quedaban casi idénticos como badge (ambos un
  // tinte pálido sobre la paleta "pacific" que ya de por sí no tiene un gris
  // neutro puro) — bug real reportado por el usuario. Se separan a propósito:
  // NOT_STARTED más apagado (bg-slate-50, casi blanco) e IN_PROGRESS más
  // saturado (bg-blue-100) para que la tarea activa salte a la vista.
  NOT_STARTED: { dot: "bg-slate-400", badge: "bg-slate-50 text-slate-500", solid: "bg-slate-700 hover:bg-slate-800", bar: "bg-slate-300", tint: "bg-white" },
  IN_PROGRESS: { dot: "bg-blue-500", badge: "bg-blue-100 text-blue-700", solid: "bg-blue-600 hover:bg-blue-700", bar: "bg-blue-500", tint: "bg-blue-50" },
  // Punto confirmado con el usuario: en la barra del Gantt el rojo queda
  // reservado EXCLUSIVAMENTE para "vencida" (overdue, ver barColor en
  // GanttView.tsx) — Bloqueada ya se distingue con el candado (GanttBar.tsx),
  // así que su barra usa un gris más oscuro en vez de competir por el rojo.
  // dot/badge/solid/tint (Kanban, control de estado, etc.) siguen en rojo,
  // sin cambios — el pedido fue puntual sobre la barra.
  BLOCKED: { dot: "bg-red-500", badge: "bg-red-50 text-red-700", solid: "bg-red-600 hover:bg-red-700", bar: "bg-slate-600", tint: "bg-red-50" },
  COMPLETED: { dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700", solid: "bg-emerald-600 hover:bg-emerald-700", bar: "bg-emerald-500", tint: "bg-emerald-50" },
  RETURNED: { dot: "bg-orange-500", badge: "bg-orange-50 text-orange-700", solid: "bg-orange-600 hover:bg-orange-700", bar: "bg-orange-500", tint: "bg-orange-50" },
};

/**
 * Fondo completo de la tarjeta/nodo (no solo una etiqueta chica): la señal
 * de atraso/vencimiento pisa el color de estado crudo, igual que en las
 * barras del Gantt — así una tarea "en curso" pero atrasada se ve roja, no
 * azul, en cualquier lugar donde aparezca.
 */
// Estado derivado de un ítem de la cascada de Definición (Objetivo,
// Requerimiento, Fase — no tienen un campo "status" propio como Task) a
// partir de su % de avance y su bandera de riesgo, con la misma paleta que
// TASK_STATUS_COLOR para que el mismo color siga significando lo mismo en
// toda la app.
export function pctStatus(pct: number, atRisk: boolean): { label: string; className: string } {
  if (atRisk) return { label: "En riesgo", className: "bg-red-50 text-red-700" };
  if (pct >= 100) return { label: "Completado", className: "bg-emerald-50 text-emerald-700" };
  if (pct <= 0) return { label: "Sin iniciar", className: "bg-slate-100 text-slate-700" };
  return { label: "En curso", className: "bg-blue-50 text-blue-700" };
}

// Mismo criterio de color que el resto de la app: rojo = urgente/problema
// (vencida, bloqueada, causó atraso), ámbar = advertencia (por vencer),
// azul = informativo (asignación nueva) — para distinguir de un vistazo el
// tipo de notificación en la campana.
export const NOTIFICATION_TYPE_COLOR: Record<NotificationType, string> = {
  ASSIGNED: "bg-blue-500",
  DEADLINE_APPROACHING: "bg-amber-500",
  OVERDUE: "bg-red-500",
  BLOCKED: "bg-red-500",
  DELAY_CAUSED: "bg-red-500",
  RETURNED: "bg-orange-500",
  LATE_START: "bg-blue-400",
  LATE_START_CRITICAL: "bg-red-500",
  REVIEW_REQUESTED: "bg-teal-500",
  SHARE_ACTIVITY: "bg-sky-500",
  MENTION: "bg-teal-500",
  URGENT_TASK: "bg-red-600",
  SYSTEM: "bg-slate-500",
};

export function taskCardTint(status: TaskStatus, alertLevel: TaskAlert["level"]) {
  if (status === "COMPLETED") return TASK_STATUS_COLOR.COMPLETED.tint;
  if (status === "BLOCKED") return TASK_STATUS_COLOR.BLOCKED.tint;
  if (alertLevel === "overdue") return "bg-red-50";
  if (alertLevel === "warning") return "bg-amber-50";
  return TASK_STATUS_COLOR[status].tint;
}
