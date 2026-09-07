const DAY_WIDTH = 28;
const LABEL_WIDTH = 260;

export type GanttTask = {
  id: string;
  title: string;
  phaseName: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";
  startIndex: number;
  span: number;
};

const STATUS_COLOR: Record<GanttTask["status"], string> = {
  COMPLETED: "bg-emerald-500",
  IN_PROGRESS: "bg-blue-500",
  BLOCKED: "bg-red-500",
  NOT_STARTED: "bg-slate-300",
};

function monthLabel(date: Date) {
  return date.toLocaleDateString("es-CO", { month: "short" }).replace(".", "").toUpperCase();
}

export function GanttView({
  projectId,
  businessDays,
  tasks,
}: {
  projectId: string;
  businessDays: Date[];
  tasks: GanttTask[];
}) {
  const today = new Date();
  const todayIndex = businessDays.findIndex(
    (d) => d.toDateString() === today.toDateString()
  );

  const monthGroups: { label: string; count: number }[] = [];
  for (const day of businessDays) {
    const label = monthLabel(day);
    const last = monthGroups[monthGroups.length - 1];
    if (last && last.label === label) last.count += 1;
    else monthGroups.push({ label, count: 1 });
  }

  const grouped = new Map<string, GanttTask[]>();
  for (const t of tasks) {
    if (!grouped.has(t.phaseName)) grouped.set(t.phaseName, []);
    grouped.get(t.phaseName)!.push(t);
  }

  const timelineWidth = businessDays.length * DAY_WIDTH;

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <div style={{ minWidth: LABEL_WIDTH + timelineWidth }}>
        {/* Header: meses */}
        <div className="flex border-b border-slate-200 text-xs font-medium text-slate-500">
          <div style={{ width: LABEL_WIDTH }} className="flex-shrink-0 px-3 py-2">
            Tarea
          </div>
          <div className="flex">
            {monthGroups.map((m, i) => (
              <div
                key={i}
                style={{ width: m.count * DAY_WIDTH }}
                className="border-l border-slate-100 py-2 text-center"
              >
                {m.label}
              </div>
            ))}
          </div>
        </div>

        {Array.from(grouped.entries()).map(([phaseName, phaseTasks]) => (
          <div key={phaseName}>
            <div
              className="flex bg-slate-50 text-xs font-semibold text-slate-600"
              style={{ minWidth: LABEL_WIDTH + timelineWidth }}
            >
              <div style={{ width: LABEL_WIDTH }} className="flex-shrink-0 px-3 py-1.5">
                {phaseName}
              </div>
            </div>
            {phaseTasks.map((t) => (
              <div key={t.id} className="flex items-center border-t border-slate-100">
                <a
                  href={`/projects/${projectId}/tasks/${t.id}`}
                  style={{ width: LABEL_WIDTH }}
                  className="flex-shrink-0 truncate px-3 py-2 text-sm text-slate-700 hover:underline"
                  title={t.title}
                >
                  {t.title}
                </a>
                <div className="relative" style={{ width: timelineWidth, height: 32 }}>
                  {todayIndex >= 0 && (
                    <div
                      className="absolute top-0 h-full w-px bg-amber-400"
                      style={{ left: todayIndex * DAY_WIDTH + DAY_WIDTH / 2 }}
                    />
                  )}
                  <div
                    className={`absolute top-1.5 h-5 rounded ${STATUS_COLOR[t.status]}`}
                    style={{ left: t.startIndex * DAY_WIDTH, width: Math.max(t.span, 1) * DAY_WIDTH - 4 }}
                  />
                </div>
              </div>
            ))}
          </div>
        ))}

        {tasks.length === 0 && (
          <p className="p-4 text-sm text-slate-400">Todavía no hay tareas para graficar.</p>
        )}
      </div>
    </div>
  );
}
