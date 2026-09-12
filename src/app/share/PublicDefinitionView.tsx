function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 flex-shrink-0 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="flex-shrink-0 text-xs text-slate-500">{pct}%</span>
    </div>
  );
}

/** Objetivos, requerimientos y fases de solo lectura para el link compartido — sin edición, sin holguras/variaciones internas. */
export function PublicDefinitionView({
  description,
  objectives,
  requirements,
  phases,
}: {
  description: string | null;
  objectives: { id: string; title: string; description: string | null; pct: number }[];
  requirements: { id: string; title: string; description: string | null; pct: number }[];
  phases: { id: string; name: string; pct: number }[];
}) {
  return (
    <div className="space-y-4">
      {description && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="prose prose-sm max-w-none text-sm text-slate-700" dangerouslySetInnerHTML={{ __html: description }} />
        </div>
      )}

      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-medium text-slate-900">Objetivos</h2>
        {objectives.length === 0 && <p className="text-sm text-slate-400">Sin objetivos definidos.</p>}
        {objectives.map((o) => (
          <div key={o.id} className="space-y-1 border-t border-slate-100 pt-2 first:border-0 first:pt-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-800">{o.title}</p>
              <ProgressBar pct={o.pct} />
            </div>
            {o.description && <p className="text-sm text-slate-500">{o.description}</p>}
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-medium text-slate-900">Requerimientos</h2>
        {requirements.length === 0 && <p className="text-sm text-slate-400">Sin requerimientos definidos.</p>}
        {requirements.map((r) => (
          <div key={r.id} className="space-y-1 border-t border-slate-100 pt-2 first:border-0 first:pt-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-800">{r.title}</p>
              <ProgressBar pct={r.pct} />
            </div>
            {r.description && <p className="text-sm text-slate-500">{r.description}</p>}
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-medium text-slate-900">Fases</h2>
        {phases.length === 0 && <p className="text-sm text-slate-400">Sin fases definidas.</p>}
        {phases.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 first:border-0 first:pt-0">
            <p className="text-sm font-medium text-slate-800">{p.name}</p>
            <ProgressBar pct={p.pct} />
          </div>
        ))}
      </div>
    </div>
  );
}
