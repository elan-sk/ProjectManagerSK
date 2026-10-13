import Link from "next/link";
import { ModalTrigger } from "@/components/Modal";
import { ProgressFill } from "@/components/ProgressFill";
import { DEFINITION_LEVEL_COLOR, DEFINITION_LEVEL_FILL } from "@/lib/statusColors";

type Row = { id: string; label: string; pct: number; atRisk: boolean };
type LevelKey = "OBJECTIVE" | "REQUIREMENT" | "PHASE";

const BLOCK_LABEL = "text-xs font-semibold uppercase tracking-wide text-slate-400";
const BLOCK_DIVIDER = "border-t border-slate-200 pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5";

function Group({ level, title, rows }: { level: LevelKey | null; title: string; rows: Row[] }) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
        <span className={`h-2 w-2 rounded-full ${level ? DEFINITION_LEVEL_COLOR[level].dot : "bg-slate-500"}`} aria-hidden />
        {title}
        <span className="text-slate-400">{rows.length}</span>
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">Sin definir.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const RowContent = level ? "a" : "div";
            return (
              <li key={r.id} title={`${r.label}: ${r.pct}%${r.atRisk ? " · con tareas atrasadas" : ""}`}>
                <RowContent
                  href={level ? `#definition-${level.toLowerCase()}-${r.id}` : undefined}
                  className={`grid grid-cols-[minmax(0,1fr)_4.5rem_2.5rem] items-center gap-2 text-sm ${level ? "cursor-pointer rounded hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-teal-700" : ""}`}
                >
                  <span className="truncate text-slate-600">{r.label}</span>
                  <span className="h-1.5 overflow-hidden bg-slate-100">
                    <ProgressFill pct={r.pct} className={level ? DEFINITION_LEVEL_FILL[level] : "progress-fill-emerald"} durationMs={500} />
                  </span>
                  <span className="text-right tabular-nums text-slate-500">{r.pct}%</span>
                </RowContent>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function DefinitionSummary({
  taskProgress,
  objectives,
  requirements,
  phases,
  subprojects,
  unassignedTasks,
}: {
  taskProgress: { completed: number; total: number };
  objectives: Row[];
  requirements: Row[];
  phases: Row[];
  subprojects: Row[];
  unassignedTasks: { id: string; title: string; href: string; phaseId: string }[];
}) {
  const pct = taskProgress.total > 0 ? Math.round((taskProgress.completed / taskProgress.total) * 100) : 0;
  const atRisk = [...objectives, ...requirements, ...phases].filter((r) => r.atRisk).length;
  const unassignedByPhase = phases
    .map((p) => ({ id: p.id, name: p.label, tasks: unassignedTasks.filter((t) => t.phaseId === p.id) }))
    .filter((p) => p.tasks.length > 0);

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4" aria-label="Resumen de avance">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-semibold text-slate-900">Resumen de avance</h2>
          <p className="text-sm text-slate-500">
            {taskProgress.completed} de {taskProgress.total} {taskProgress.total === 1 ? "tarea completada" : "tareas completadas"}
            {subprojects.length > 0 && " (incluye los subproyectos)"}
            {atRisk > 0 && <span className="text-red-700"> · {atRisk} en riesgo</span>}
          </p>
        </div>
        <p className="text-4xl font-semibold tabular-nums text-slate-900">{pct}%</p>
      </div>
      <div className="h-2 overflow-hidden bg-slate-100" role="img" aria-label={`Avance del proyecto: ${pct}%`}>
        <ProgressFill pct={pct} className="progress-fill-emerald" />
      </div>

      <div className={`grid grid-cols-1 gap-5 ${subprojects.length > 0 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <div className="min-w-0 space-y-2 lg:col-span-2">
          <p className={BLOCK_LABEL}>Alcance</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Group level="OBJECTIVE" title="Objetivos" rows={objectives} />
            <Group level="REQUIREMENT" title="Requerimientos" rows={requirements} />
          </div>
        </div>
        <div className={`min-w-0 space-y-2 ${BLOCK_DIVIDER}`}>
          <p className={BLOCK_LABEL}>Cronograma</p>
          <Group level="PHASE" title="Fases" rows={phases} />
        </div>
        {subprojects.length > 0 && (
          <div className={`min-w-0 space-y-2 ${BLOCK_DIVIDER}`}>
            <p className={BLOCK_LABEL}>Grupo</p>
            <Group level={null} title="Subproyectos" rows={subprojects} />
          </div>
        )}
      </div>

      {unassignedTasks.length > 0 && (
        <ModalTrigger
          label={`${unassignedTasks.length} ${unassignedTasks.length === 1 ? "tarea sin requerimiento" : "tareas sin requerimiento"}`}
          title="Tareas sin requerimiento"
          compact
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 underline decoration-dotted underline-offset-2 hover:text-slate-900"
        >
          <div className="max-h-[60vh] space-y-3 overflow-x-hidden overflow-y-auto">
            {unassignedByPhase.map((p) => (
              <div key={p.id}>
                <p className="text-sm font-medium text-slate-900">{p.name}</p>
                <ul className="mt-1 space-y-0.5 text-sm text-slate-600">
                  {p.tasks.map((t) => (
                    <li key={t.id}>
                      <Link href={t.href} className="block break-words rounded px-1.5 py-1 hover:bg-slate-50 hover:text-slate-900 hover:underline">
                        {t.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </ModalTrigger>
      )}
    </section>
  );
}
