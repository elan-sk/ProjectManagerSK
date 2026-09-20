import Link from "next/link";
import { TASK_STATUS_COLOR, TASK_STATUS_LABEL } from "@/lib/statusColors";
import { rangeForMode, addDays, isoDay, type CalendarMode } from "@/lib/calendarGrid";
import { AlertBadge } from "@/components/AlertBadge";
import { ReferencePopover } from "@/components/ReferencePopover";
import { OverlapIcon, UrgentIcon } from "@/components/icons";
import { CalendarTaskLink } from "./CalendarTaskLink";
import type { TaskAlert } from "@/lib/delays";
import type { CollisionInfo } from "@/lib/collisions";
import type { TaskStatus } from "@prisma/client";

export type CalendarTask = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  isUrgent: boolean;
  plannedStart: string;
  plannedEnd: string;
  status: TaskStatus;
  alert: TaskAlert;
  collidesWith: CollisionInfo[] | null;
};

// Urgente (sin completar): color rojo fuerte + icono, por encima de la alerta normal.
const isUrgentOpen = (t: { isUrgent: boolean; status: TaskStatus }) => t.isUrgent && t.status !== "COMPLETED";
const URGENT_CHIP = "bg-red-600 text-white font-semibold";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const ALERT_CHIP: Partial<Record<string, string>> = {
  overdue: "bg-red-100 text-red-800",
  blocked: "bg-rose-100 text-rose-800",
  warning: "bg-amber-100 text-amber-800",
};

function collisionText(t: CalendarTask) {
  if (!t.collidesWith || t.collidesWith.length === 0) return null;
  return `Coincide en fechas con: ${t.collidesWith.map((c) => `${c.title} (${c.projectName})`).join(", ")}`;
}

/** Grilla de calendario — mes, semana o día. Puede acotarse a un proyecto o mostrar varios (showProjectName). Filtros y navegación viven en la página que la usa. */
export function ProjectCalendarView({
  tasks,
  mode,
  anchor,
  showProjectName = false,
  collisionUrlBase = "/projects",
}: {
  tasks: CalendarTask[];
  mode: CalendarMode;
  anchor: Date;
  showProjectName?: boolean;
  // Ver mismo comentario en KanbanBoard: base de "Ver mis colisiones", solo
  // relevante cuando la pasa /projects/page.tsx.
  collisionUrlBase?: string;
}) {
  const { start, end } = rangeForMode(mode, anchor);
  const tasksParsed = tasks.map((t) => ({ ...t, start: new Date(t.plannedStart), end: new Date(t.plannedEnd) }));
  const now = new Date();

  if (mode === "day") {
    // Estilo Agenda (punto pedido): no un solo día — TODAS las tareas ya
    // filtradas, agrupadas por su día de inicio, en orden cronológico, con
    // franjas de color alternadas por grupo para separarlos de un vistazo.
    const sorted = [...tasksParsed].sort((a, b) => a.start.getTime() - b.start.getTime());
    const groups: { dayKey: string; date: Date; tasks: typeof sorted }[] = [];
    for (const t of sorted) {
      const key = isoDay(t.start);
      const last = groups[groups.length - 1];
      if (last && last.dayKey === key) last.tasks.push(t);
      else groups.push({ dayKey: key, date: t.start, tasks: [t] });
    }

    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {groups.length === 0 && <p className="p-4 text-sm text-slate-400">Sin tareas.</p>}
        {groups.map((g, i) => (
          <div key={g.dayKey} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
            <p className="border-b border-slate-100 px-3 py-1.5 text-xs font-semibold capitalize text-slate-500">
              {g.date.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
            </p>
            <ul className="divide-y divide-slate-100">
              {g.tasks.map((t) => (
                <li
                  key={t.id}
                  // ponytail: mismo criterio que Kanban/Gantt — esta lista es
                  // la única del calendario sin tope por celda (vista Día =
                  // TODAS las tareas filtradas), así que se beneficia de
                  // saltar el render de filas fuera de vista.
                  style={{ contentVisibility: "auto", containIntrinsicSize: "auto 48px" }}
                >
                  <div className="flex items-center justify-between gap-3 p-3 hover:bg-slate-50">
                    <Link
                      href={`/projects/${t.projectId}/tasks/${t.id}`}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-slate-900"
                    >
                      {isUrgentOpen(t) && <UrgentIcon className="h-4 w-4 flex-shrink-0 text-red-600" />}
                      {showProjectName && <span className="flex-shrink-0 text-slate-400">{t.projectName} ·</span>}
                      <span className={`truncate ${isUrgentOpen(t) ? "font-semibold text-red-700" : ""}`}>{t.title}</span>
                    </Link>
                    {t.collidesWith && t.collidesWith.length > 0 && (
                      <ReferencePopover
                        trigger={<OverlapIcon className="h-3.5 w-3.5 flex-shrink-0 text-indigo-500" />}
                        hoverText={collisionText(t)!}
                        items={t.collidesWith.map((c) => ({
                          id: c.taskId,
                          label: `${c.title} (${c.projectName})`,
                          href: `/projects/${c.projectId}/tasks/${c.taskId}`,
                        }))}
                        filteredHref={`${collisionUrlBase}${collisionUrlBase.includes("?") ? "&" : "?"}collision=${t.id}`}
                        filteredLabel="Ver mis colisiones"
                        extraHref={`/collisions/${t.id}`}
                        extraLabel="Ver detalle y alternativas"
                      />
                    )}
                    <span className="flex flex-shrink-0 items-center gap-1.5">
                      {t.alert.level === "onTrack" && (
                        <span className="text-[11px] text-slate-400">vence en {t.alert.daysRemaining}d</span>
                      )}
                      <AlertBadge alert={t.alert} />
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ALERT_CHIP[t.alert.level] ?? TASK_STATUS_COLOR[t.status].badge}`}>
                        {TASK_STATUS_LABEL[t.status]}
                      </span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  const gridDays: Date[] = [];
  for (let c = new Date(start); c <= end; c = addDays(c, 1)) gridDays.push(c);
  const maxPerCell = mode === "week" ? 8 : 3;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="grid grid-cols-7 border-b border-slate-200 text-center text-xs font-medium text-slate-500">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {gridDays.map((day) => {
          const dayTasks = tasksParsed.filter((t) => t.start <= day && t.end >= day);
          const inMonth = mode === "week" || day.getUTCMonth() === anchor.getUTCMonth();
          const isToday = isoDay(day) === isoDay(now);
          return (
            <div
              key={day.toISOString()}
              className={`border-b border-r border-slate-100 p-1.5 ${mode === "week" ? "min-h-48" : "min-h-28"} ${inMonth ? "bg-white" : "bg-slate-50"}`}
            >
              <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                  isToday ? "bg-slate-900 text-white" : inMonth ? "text-slate-600" : "text-slate-300"
                }`}
              >
                {day.getUTCDate()}
              </span>
              <div className="mt-1 space-y-1">
                {dayTasks.slice(0, maxPerCell).map((t) => {
                  const label = showProjectName ? `${t.projectName} · ${t.title}` : t.title;
                  const collision = collisionText(t);
                  return (
                    <CalendarTaskLink
                      key={t.id}
                      href={`/projects/${t.projectId}/tasks/${t.id}`}
                      title={label}
                      start={t.start}
                      end={t.end}
                      alert={t.alert}
                      collisionText={collision}
                      className={`flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] ${isUrgentOpen(t) ? URGENT_CHIP : (ALERT_CHIP[t.alert.level] ?? TASK_STATUS_COLOR[t.status].badge)}`}
                    >
                      {isUrgentOpen(t) && <UrgentIcon className="h-2.5 w-2.5 flex-shrink-0" />}
                      {collision && <OverlapIcon className="h-2.5 w-2.5 flex-shrink-0" />}
                      <span className="truncate">{label}</span>
                    </CalendarTaskLink>
                  );
                })}
                {dayTasks.length > maxPerCell && (
                  <span className="block px-1 text-[11px] text-slate-400">+{dayTasks.length - maxPerCell} más</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
