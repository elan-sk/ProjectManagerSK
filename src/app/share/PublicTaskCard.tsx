import { TASK_STATUS_LABEL, TASK_STATUS_COLOR } from "@/lib/statusColors";
import type { PublicTask } from "@/lib/publicView";

const DATE_FMT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" };

/** Título + descripción + tiempos estimados + estado + fase — nunca asignados, alertas ni tiempos reales (punto 1.1). */
export function PublicTaskCard({ task }: { task: PublicTask }) {
  const color = TASK_STATUS_COLOR[task.status];
  return (
    <div className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-slate-900">{task.title}</h3>
        <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${color.badge}`}>
          {TASK_STATUS_LABEL[task.status]}
        </span>
      </div>
      <p className="text-xs text-slate-400">{task.phaseName}</p>
      {task.description && (
        <div className="prose prose-sm max-w-none text-sm text-slate-600" dangerouslySetInnerHTML={{ __html: task.description }} />
      )}
      <p className="text-xs text-slate-500">
        Estimado: {new Date(task.plannedStart).toLocaleDateString("es-CO", DATE_FMT)} — {new Date(task.plannedEnd).toLocaleDateString("es-CO", DATE_FMT)}
      </p>
    </div>
  );
}
