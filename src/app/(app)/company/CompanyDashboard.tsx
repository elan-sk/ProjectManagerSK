import Link from "next/link";
import { BarChart } from "@/components/charts/BarChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { ComboFilter } from "@/components/ComboFilter";
import { toDonutData } from "@/lib/chartPalette";
import type { Indicator } from "@/lib/companyIndicators";

export const DASHBOARD_PERIODS = [
  { id: "month", label: "Último mes", days: 30 },
  { id: "quarter", label: "Últimos 3 meses", days: 90 },
  { id: "year", label: "Último año", days: 365 },
  { id: "all", label: "Todo", days: null },
] as const;

type Props = { indicators: Indicator[]; period: string; clientId: string | undefined; clients: { id: string; label: string }[] };

export function CompanyDashboard({ indicators, period, clientId, clients }: Props) {
  const href = (p: string) => {
    const q = new URLSearchParams({ periodo: p, ...(clientId ? { cliente: clientId } : {}) });
    return `/company?${q}#tablero`;
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-slate-900" data-feature-hint="company-dashboard">
          Tablero
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {DASHBOARD_PERIODS.map((p) => (
            <Link key={p.id} href={href(p.id)} scroll={false} className={`rounded-full border px-3 py-1 text-sm ${period === p.id ? "border-[#073b4c] bg-[#073b4c] text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}>
              {p.label}
            </Link>
          ))}
          {clients.length > 0 && (
            <ComboFilter allLabel="Todos los clientes" value={clientId} options={clients} paramKey="cliente" basePath="/company" currentParams={{ periodo: period }} align="right" />
          )}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {indicators.map((ind) => (
          <article key={ind.key} className="min-w-0 space-y-3 rounded-2xl border border-slate-100 p-5">
            <h3 className="text-[15px] font-semibold text-slate-900">{ind.title}</h3>
            {ind.rows.length === 0 ? (
              <p className="text-sm text-slate-400">Sin datos</p>
            ) : ind.kind === "donut" ? (
              <div className="flex flex-wrap items-center gap-4">
                <DonutChart data={toDonutData(ind.rows.map((r) => ({ category: r.label, count: r.value })))} />
                <ul className="min-w-0 flex-1 space-y-1 text-sm text-slate-700">
                  {ind.rows.map((r) => (
                    <li key={r.label} className="flex justify-between gap-2">
                      <span className="truncate">{r.label}</span>
                      <span className="shrink-0 font-medium">{r.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="max-h-72 overflow-x-hidden overflow-y-auto pr-1">
                <BarChart data={ind.rows.slice(0, 15).map((r) => ({ label: r.label, value: r.value, note: r.note }))} valueSuffix={ind.unit} emptyLabel="Sin datos" />
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
