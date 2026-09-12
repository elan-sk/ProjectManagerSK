import Link from "next/link";
import { addDays, dayKey, mondayOnOrBefore, sundayOnOrAfter, rangeForMode } from "@/lib/calendarGrid";
import { TASK_STATUS_COLOR } from "@/lib/statusColors";
import type { PublicTask } from "@/lib/publicView";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function monthAnchorKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Calendario mensual de solo lectura para el link compartido — sin alertas ni colisiones. */
export function PublicCalendarView({ tasks, anchor, basePath }: { tasks: PublicTask[]; anchor: Date; basePath: string }) {
  const { start, end } = rangeForMode("month", anchor);
  const gridStart = mondayOnOrBefore(start);
  const gridEnd = sundayOnOrAfter(end);
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  const prevAnchor = addDays(start, -1);
  const nextAnchor = addDays(end, 1);

  const tasksByDay = new Map<string, PublicTask[]>();
  for (const t of tasks) {
    const taskStart = new Date(t.plannedStart);
    const taskEnd = new Date(t.plannedEnd);
    for (let d = taskStart; d <= taskEnd; d = addDays(d, 1)) {
      const key = dayKey(d);
      if (!tasksByDay.has(key)) tasksByDay.set(key, []);
      tasksByDay.get(key)!.push(t);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <Link href={`${basePath}?month=${monthAnchorKey(prevAnchor)}`} className="rounded-lg bg-slate-100 px-3 py-1.5 hover:bg-slate-200">
          ‹
        </Link>
        <span className="font-medium capitalize text-slate-900">
          {anchor.toLocaleDateString("es-CO", { month: "long", year: "numeric", timeZone: "UTC" })}
        </span>
        <Link href={`${basePath}?month=${monthAnchorKey(nextAnchor)}`} className="rounded-lg bg-slate-100 px-3 py-1.5 hover:bg-slate-200">
          ›
        </Link>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 text-xs">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="bg-slate-50 px-2 py-1 text-center font-medium text-slate-500">
            {label}
          </div>
        ))}
        {days.map((d) => {
          const inMonth = d.getUTCMonth() === anchor.getUTCMonth();
          const dayTasks = tasksByDay.get(dayKey(d)) ?? [];
          return (
            <div key={dayKey(d)} className={`min-h-24 space-y-1 bg-white p-1.5 ${inMonth ? "" : "bg-slate-50 text-slate-300"}`}>
              <p className="text-[11px] font-medium">{d.getUTCDate()}</p>
              {dayTasks.slice(0, 3).map((t) => (
                <p key={t.id} className={`truncate rounded px-1 py-0.5 text-[10px] text-white ${TASK_STATUS_COLOR[t.status].solid}`}>
                  {t.title}
                </p>
              ))}
              {dayTasks.length > 3 && <p className="text-[10px] text-slate-400">+{dayTasks.length - 3} más</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
