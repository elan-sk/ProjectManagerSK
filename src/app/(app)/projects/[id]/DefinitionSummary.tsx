import { DEFINITION_LEVEL_COLOR } from "@/lib/statusColors";

type Row = { id: string; label: string; pct: number; atRisk: boolean };

// Resumen gráfico de la Definición: el avance de objetivos, requerimientos y fases (y subproyectos en un
// principal) juntos en una sola tarjeta, para leerlos de un vistazo en vez de tarjeta por tarjeta.
// Mismas barras de avance que el resto de la pestaña (verde; roja si hay tareas atrasadas).
export function DefinitionSummary({
  taskProgress,
  objectives,
  requirements,
  phases,
  subprojects,
}: {
  taskProgress: { completed: number; total: number };
  objectives: Row[];
  requirements: Row[];
  phases: Row[];
  subprojects: Row[];
}) {
  const pct = taskProgress.total > 0 ? Math.round((taskProgress.completed / taskProgress.total) * 100) : 0;
  const atRisk = [...objectives, ...requirements, ...phases].filter((r) => r.atRisk).length;
  const groups = [
    { key: "OBJECTIVE" as const, title: "Objetivos", rows: objectives },
    { key: "REQUIREMENT" as const, title: "Requerimientos", rows: requirements },
    { key: "PHASE" as const, title: "Fases", rows: phases },
    ...(subprojects.length > 0 ? [{ key: null, title: "Subproyectos", rows: subprojects }] : []),
  ];

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
        <div className="progress-fill-emerald h-full" style={{ width: `${pct}%` }} />
      </div>

      <div className={`grid grid-cols-1 gap-5 sm:grid-cols-2 ${groups.length > 3 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {groups.map((g) => (
          <div key={g.title} className="min-w-0 space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <span className={`h-2 w-2 rounded-full ${g.key ? DEFINITION_LEVEL_COLOR[g.key].dot : "bg-slate-500"}`} aria-hidden />
              {g.title}
              <span className="text-slate-400">{g.rows.length}</span>
            </p>
            {g.rows.length === 0 ? (
              <p className="text-sm text-slate-400">Sin definir.</p>
            ) : (
              <ul className="space-y-1.5">
                {g.rows.map((r) => (
                  <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_4.5rem_2.5rem] items-center gap-2 text-sm" title={`${r.label}: ${r.pct}%${r.atRisk ? " · con tareas atrasadas" : ""}`}>
                    <span className="truncate text-slate-600">{r.label}</span>
                    <span className="h-1.5 overflow-hidden bg-slate-100">
                      <span className={`block h-full ${r.atRisk ? "progress-fill-red" : "progress-fill-emerald"}`} style={{ width: `${r.pct}%` }} />
                    </span>
                    <span className={`text-right tabular-nums ${r.atRisk ? "text-red-700" : "text-slate-500"}`}>{r.pct}%</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
