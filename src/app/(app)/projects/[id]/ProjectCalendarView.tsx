import Link from "next/link";
import { TASK_STATUS_COLOR, TASK_STATUS_LABEL } from "@/lib/statusColors";
import { rangeForMode, addDays, isoDay, type CalendarMode } from "@/lib/calendarGrid";
import { AlertBadge } from "@/components/AlertBadge";
import { OverlapIcon } from "@/components/icons";
import type { TaskAlert } from "@/lib/delays";
import type { CollisionInfo } from "@/lib/collisions";
import type { TaskStatus } from "@prisma/client";

export type CalendarTask = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  plannedStart: string;
  plannedEnd: string;
  status: TaskStatus;
  alert: TaskAlert;
  collidesWith: CollisionInfo[] | null;
};

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
}: {
  tasks: CalendarTask[];
  mode: CalendarMode;
  anchor: Date;
  showProjectName?: boolean;
}) {
  const { start, end } = rangeForMode(mode, anchor);
  const tasksParsed = tasks.map((t) => ({ ...t, start: new Date(t.plannedStart), end: new Date(t.plannedEnd) }));
  const now = new Date();

  if (mode === "day") {
    const dayTasks = tasksParsed.filter((t) => t.start <= start && t.end >= start);
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {dayTasks.length === 0 && <p className="p-4 text-sm text-slate-400">Sin tareas este día.</p>}
        <ul className="divide-y divide-slate-100">
          {dayTasks.map((t) => (
            <li key={t.id}>
              <Link
                href={`/projects/${t.projectId}/tasks/${t.id}`}
                className="flex items-center justify-between gap-3 p-3 hover:bg-slate-50"
              >
                <span className="flex min-w-0 items-center gap-1.5 text-sm text-slate-900">
                  {showProjectName && <span className="flex-shrink-0 text-slate-400">{t.projectName} ·</span>}
                  <span className="truncate">{t.title}</span>
                  {collisionText(t) && (
                    <span title={collisionText(t)!}>
                      <OverlapIcon className="h-3.5 w-3.5 flex-shrink-0 text-indigo-500" />
                    </span>
                  )}
                </span>
                <span className="flex flex-shrink-0 items-center gap-1.5">
                  <AlertBadge alert={t.alert} />
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ALERT_CHIP[t.alert.level] ?? TASK_STATUS_COLOR[t.status].badge}`}>
                    {TASK_STATUS_LABEL[t.status]}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
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
                  const title =
                    t.alert.level === "overdue"
                      ? `${label} — ${t.alert.businessDaysOverdue}d de atraso`
                      : t.alert.level === "warning"
                      ? `${label} — vence pronto`
                      : label;
                  return (
                    <Link
                      key={t.id}
                      href={`/projects/${t.projectId}/tasks/${t.id}`}
                      title={collision ? `${title}\n${collision}` : title}
                      className={`flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] ${ALERT_CHIP[t.alert.level] ?? TASK_STATUS_COLOR[t.status].badge}`}
                    >
                      {collision && <OverlapIcon className="h-2.5 w-2.5 flex-shrink-0" />}
                      <span className="truncate">{label}</span>
                    </Link>
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
