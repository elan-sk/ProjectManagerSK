import { TASK_STATUS_COLOR } from "@/lib/statusColors";
import type { PublicTask } from "@/lib/publicView";

const DAY_WIDTH = 22;
const DATE_FMT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", timeZone: "UTC" };

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/**
 * Gantt de solo lectura para el link compartido — escala en días
 * calendario (no hábiles): es informativo para el cliente, no hace falta
 * el mismo rigor que el Gantt interno de gestión. Sin drag, sin
 * dependencias interactivas, sin alertas, sin asignados.
 */
export function PublicGanttView({ tasks, phases }: { tasks: PublicTask[]; phases: { id: string; name: string }[] }) {
  if (tasks.length === 0) return <p className="text-sm text-slate-400">Sin tareas todavía.</p>;

  const rangeStart = new Date(Math.min(...tasks.map((t) => new Date(t.plannedStart).getTime())));
  const rangeEnd = new Date(Math.max(...tasks.map((t) => new Date(t.plannedEnd).getTime())));
  const totalDays = daysBetween(rangeStart, rangeEnd) + 1;

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <div style={{ minWidth: totalDays * DAY_WIDTH + 220 }}>
        {phases.map((phase) => {
          const phaseTasks = tasks.filter((t) => t.phaseName === phase.name);
          if (phaseTasks.length === 0) return null;
          return (
            <div key={phase.id}>
              <div className="sticky left-0 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
                {phase.name}
              </div>
              {phaseTasks.map((t) => {
                const start = daysBetween(rangeStart, new Date(t.plannedStart));
                const span = daysBetween(new Date(t.plannedStart), new Date(t.plannedEnd)) + 1;
                return (
                  <div key={t.id} className="flex items-center border-b border-slate-50 text-xs">
                    <div className="w-[220px] flex-shrink-0 truncate px-3 py-1.5 text-slate-700">{t.title}</div>
                    <div className="relative h-6 flex-1" style={{ minWidth: totalDays * DAY_WIDTH }}>
                      <div
                        title={`${t.title}: ${new Date(t.plannedStart).toLocaleDateString("es-CO", DATE_FMT)} — ${new Date(t.plannedEnd).toLocaleDateString("es-CO", DATE_FMT)}`}
                        className={`absolute top-1 h-4 rounded ${TASK_STATUS_COLOR[t.status].bar}`}
                        style={{ left: start * DAY_WIDTH, width: Math.max(span * DAY_WIDTH - 2, 4) }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
