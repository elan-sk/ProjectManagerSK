/** Barras horizontales rankeadas — para listas ordenadas por valor (carga por persona, atraso por persona, etc). */
export function BarChart({
  data,
  valueSuffix = "",
  emptyLabel = "Sin datos.",
}: {
  data: { label: string; value: number; colorClass?: string; note?: string }[];
  valueSuffix?: string;
  emptyLabel?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) return <p className="text-sm text-slate-400">{emptyLabel}</p>;

  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2 text-sm">
          <span className="w-28 flex-shrink-0 truncate text-slate-600" title={d.label}>
            {d.label}
          </span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${d.colorClass ?? "bg-slate-900"}`}
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </div>
          <span className="w-16 flex-shrink-0 text-right text-xs text-slate-500">
            {d.value}
            {valueSuffix}
            {d.note && <span className="ml-1 text-red-500">{d.note}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Barras verticales para series de tiempo (tendencia semanal de cierre, estilo burndown/velocity). */
export function TrendBars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-1.5" style={{ height: 100 }}>
      {data.map((d, i) => (
        <div key={`${d.label}-${i}`} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[10px] text-slate-500">{d.value > 0 ? d.value : ""}</span>
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t bg-emerald-500"
              style={{ height: d.value > 0 ? `${Math.max((d.value / max) * 100, 6)}%` : 0 }}
              title={`${d.label}: ${d.value}`}
            />
          </div>
          <span className="text-[10px] text-slate-400">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
