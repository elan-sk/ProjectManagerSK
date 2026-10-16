import type { Prisma, TaskStatus, NotificationType } from "@prisma/client";
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

// Estados DERIVADOS de una Prueba (QA) o una Aceptación, sin TaskStatus propio (por debajo sigue «En curso»): solo se
// muestran y se filtran (status=IN_REVIEW | REVIEW_APPROVED | REVIEW_ACCEPTED, «estados:en revisión» / «estados:aprobada» / «estados:aceptada»), nunca se asignan.
// - En revisión (solo Prueba): una ronda enviada y sin resultado todavía. En Aceptación la ronda la califica el
//   cliente por el link y no se sigue como «en revisión» (decisión del usuario 2026-10-16).
// - Aprobada (Prueba) / Aceptada (Aceptación): la ronda quedó aprobada (es la última: tras una aprobada no hay reenvío)
//   y la tarea aún no se completó. Separadas a pedido del usuario (2026-10-16): «Aceptada» es más clara para el cliente.
//   La devolución de ambas ya es un TaskStatus real (RETURNED).
export const REVIEW_STATES = {
  IN_REVIEW: {
    label: "En revisión",
    color: { dot: "bg-teal-500", badge: "bg-teal-50 text-teal-700", solid: "bg-teal-600 hover:bg-teal-700" },
    where: { type: "QA", reviewRounds: { some: { outcome: null } } } as Prisma.TaskWhereInput,
  },
  REVIEW_APPROVED: {
    label: "Aprobada",
    // Mismo teal que el tipo Prueba (TASK_TYPE_BADGE.QA): el ícono dice el estado, el color el tipo.
    color: { dot: "bg-teal-500", badge: "bg-teal-50 text-teal-700", solid: "bg-teal-600 hover:bg-teal-700" },
    where: { type: "QA", status: { not: "COMPLETED" }, reviewRounds: { some: { outcome: "APPROVED" }, none: { outcome: null } } } as Prisma.TaskWhereInput,
  },
  REVIEW_ACCEPTED: {
    label: "Aceptada",
    // Mismo rosa que el tipo Aceptación (TASK_TYPE_BADGE.ACCEPTANCE).
    color: { dot: "bg-pink-400", badge: "bg-pink-50 text-pink-700", solid: "bg-pink-600 hover:bg-pink-700" },
    where: { type: "ACCEPTANCE", status: { not: "COMPLETED" }, reviewRounds: { some: { outcome: "APPROVED" }, none: { outcome: null } } } as Prisma.TaskWhereInput,
  },
} as const;
export type ReviewState = keyof typeof REVIEW_STATES;

export function isReviewState(status: string | undefined): status is ReviewState {
  return status === "IN_REVIEW" || status === "REVIEW_APPROVED" || status === "REVIEW_ACCEPTED";
}

export function taskReviewState(task: { type: string; status: string; reviewRounds: { outcome: unknown }[] }): ReviewState | null {
  if (task.type !== "QA" && task.type !== "ACCEPTANCE") return null;
  if (task.reviewRounds.some((r) => r.outcome === null)) return task.type === "QA" ? "IN_REVIEW" : null;
  if (task.status !== "COMPLETED" && task.reviewRounds.some((r) => r.outcome === "APPROVED")) return task.type === "QA" ? "REVIEW_APPROVED" : "REVIEW_ACCEPTED";
  return null;
}

export function isTaskInReview(task: { type: string; reviewRounds: { outcome: unknown }[] }) {
  return task.type === "QA" && task.reviewRounds.some((r) => r.outcome === null);
}

/** Filtro Estado como condición de Prisma: un estado derivado (taskReviewState) o el TaskStatus real. */
export function taskStatusWhere(status: string | undefined) {
  if (!status) return {};
  return isReviewState(status) ? REVIEW_STATES[status].where : { status: status as TaskStatus };
}

/** Etiquetas de estado con las que se encuentra una tarea en el buscador («estados:…»): la real y, si aplica, la derivada. */
export function taskStatusLabels(task: { status: TaskStatus; type: string; reviewRounds: { outcome: unknown }[] }) {
  const state = taskReviewState(task);
  return state ? [TASK_STATUS_LABEL[task.status], REVIEW_STATES[state].label] : [TASK_STATUS_LABEL[task.status]];
}

/** Filtro Estado de las vistas: un TaskStatus real o un estado derivado de Prueba. */
export function matchesStatusFilter(status: string | undefined, task: { status: string; type: string; reviewRounds: { outcome: unknown }[] }) {
  if (!status) return true;
  return isReviewState(status) ? taskReviewState(task) === status : task.status === status;
}

/** Opciones del filtro Estado (proyecto, Panorama general, Agenda) y del buscador: fuente única. */
export function taskStatusFilterOptions() {
  const real = (s: TaskStatus) => ({ id: s as string, label: TASK_STATUS_LABEL[s], dotColorClass: TASK_STATUS_COLOR[s].dot, badge: TASK_STATUS_COLOR[s].badge });
  const derived = (s: ReviewState) => ({ id: s as string, label: REVIEW_STATES[s].label, dotColorClass: REVIEW_STATES[s].color.dot, badge: REVIEW_STATES[s].color.badge });
  return [real("NOT_STARTED"), real("IN_PROGRESS"), derived("IN_REVIEW"), derived("REVIEW_APPROVED"), derived("REVIEW_ACCEPTED"), real("BLOCKED"), real("RETURNED"), real("COMPLETED")];
}

export function statusFilterTriggerClass(status: string | undefined) {
  if (!status) return undefined;
  if (status === "ARCHIVED") return "bg-amber-500 text-white";
  return `${isReviewState(status) ? REVIEW_STATES[status].color.solid : TASK_STATUS_COLOR[status as TaskStatus]?.solid ?? ""} text-white`;
}

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

// Color de la etiqueta de cada tipo de tarea (Kanban, buscador…): fuente única.
export const TASK_TYPE_BADGE: Record<string, string> = {
  SIMPLE: "bg-slate-100 text-slate-600",
  CHECKLIST: "bg-indigo-50 text-indigo-700",
  MILESTONE: "bg-violet-50 text-violet-700",
  MEETING: "bg-sky-50 text-sky-700",
  QA: "bg-teal-50 text-teal-700",
  ADJUSTMENT: "bg-orange-50 text-orange-700",
  ACCEPTANCE: "bg-pink-50 text-pink-700",
};

export function taskTypeTextClass(type: string) {
  return TASK_TYPE_BADGE[type]?.split(" ").find((c) => c.startsWith("text-")) ?? "text-slate-600";
}

// Un mismo color por nivel de la jerarquía de Definición (Objetivo →
// Requerimiento → Fase → Tarea), para poder distinguir de un vistazo qué es
// qué en la pestaña Definición, incluso cuando un panel referencia el nivel
// de abajo dentro de sus filas (ej. las Fases dentro de un Objetivo).
// Botones de acción de la pestaña Definición (+ Objetivo, Editar, Eliminar…):
// mismo tamaño y forma en todos, para que no queden desparejos.
const DEFINITION_ACTION_BASE = "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 disabled:opacity-60";
export const DEFINITION_ACTION_BTN = `${DEFINITION_ACTION_BASE} hover:bg-slate-50 hover:text-slate-900`;
export const DEFINITION_ACTION_BTN_DANGER = `${DEFINITION_ACTION_BASE} hover:border-red-300 hover:bg-red-50 hover:text-red-600`;

export const DEFINITION_LEVEL_FILL = {
  OBJECTIVE: "progress-fill-objective",
  REQUIREMENT: "progress-fill-requirement",
  PHASE: "progress-fill-phase",
  TASK: "progress-fill-task",
} as const;

export const DEFINITION_LEVEL_HEX = { PHASE: "#0d9488", REQUIREMENT: "#0284c7" } as const;

export const DEFINITION_LEVEL_COLOR = {
  OBJECTIVE: { border: "border-violet-300", borderLeft: "border-l-violet-300", text: "text-violet-700", bg: "bg-violet-50", dot: "bg-violet-500" },
  REQUIREMENT: { border: "border-sky-300", borderLeft: "border-l-sky-300", text: "text-sky-700", bg: "bg-sky-50", dot: "bg-sky-500" },
  PHASE: { border: "border-teal-300", borderLeft: "border-l-teal-300", text: "text-teal-700", bg: "bg-teal-50", dot: "bg-teal-500" },
  TASK: { border: "border-task-300", borderLeft: "border-l-task-300", text: "text-task-700", bg: "bg-task-50", dot: "bg-task-500" },
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
  // Tono "done" propio (ver globals.css): con emerald-50 la tarjeta terminada
  // se confundía con el fondo. El borde fino (ring inset, no cambia el tamaño)
  // la destaca sin competir con las alertas.
  COMPLETED: { dot: "bg-emerald-500", badge: "bg-done-100 text-done-700", solid: "bg-emerald-600 hover:bg-emerald-700", bar: "bg-emerald-500", tint: "bg-done-50 ring-1 ring-inset ring-done-300" },
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
  if (pct >= 100) return { label: "Completado", className: TASK_STATUS_COLOR.COMPLETED.badge };
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
  CREDENTIAL_SHARED: "bg-teal-600",
};

export function taskCardTint(status: TaskStatus, alertLevel: TaskAlert["level"]) {
  if (status === "COMPLETED") return TASK_STATUS_COLOR.COMPLETED.tint;
  if (status === "BLOCKED") return TASK_STATUS_COLOR.BLOCKED.tint;
  if (alertLevel === "overdue") return "bg-red-50";
  if (alertLevel === "warning") return "bg-amber-50";
  return TASK_STATUS_COLOR[status].tint;
}
