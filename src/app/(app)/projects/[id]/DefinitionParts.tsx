"use client";

import { ReferencePopover } from "@/components/ReferencePopover";
import { TargetIcon } from "@/components/icons";
import { DEFINITION_LEVEL_COLOR } from "@/lib/statusColors";

type Level = "OBJECTIVE" | "REQUIREMENT" | "PHASE";

const LEVEL_NAME: Record<Level, string> = { OBJECTIVE: "Objetivo", REQUIREMENT: "Requerimiento", PHASE: "Fase" };

export function DefinitionCardHeading({ level, title, number, aside }: { level: Level; title: string; number?: number; aside?: React.ReactNode }) {
  const color = DEFINITION_LEVEL_COLOR[level];
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <p className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${color.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${color.dot}`} aria-hidden />
          {LEVEL_NAME[level]}
          {number !== undefined && ` ${number}`}
        </p>
        {aside}
      </div>
      <p className="mt-0.5 text-[19px] font-semibold leading-snug text-slate-900">{title}</p>
    </>
  );
}

export function DefinitionProgressBar({ pct, atRisk }: { pct: number; atRisk: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 min-w-0 flex-1 overflow-hidden bg-slate-100" role="img" aria-label={`Avance: ${pct}%`}>
        <div className={`h-full ${atRisk ? "progress-fill-teal" : "progress-fill-emerald"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="flex-shrink-0 text-[14px] font-medium tabular-nums text-slate-600">{pct}%</span>
    </div>
  );
}

export function ChildCount({ done, total }: { done: number; total: number }) {
  if (total === 0) return null;
  return (
    <span className="tracking-normal">
      {done}/{total}
    </span>
  );
}

export function ServedObjectives({ objectives }: { objectives: { id: string; title: string; description: string | null }[] }) {
  if (objectives.length === 0) return <span className="text-[12px] text-slate-400">Sin objetivo</span>;
  const color = DEFINITION_LEVEL_COLOR.OBJECTIVE;
  return (
    <ReferencePopover
      width={360}
      hoverText={objectives.map((o) => o.title).join("\n")}
      trigger={
        <span className={`inline-flex items-center gap-1 text-[12px] font-medium ${color.text}`}>
          <TargetIcon className="h-3.5 w-3.5" />
          {objectives.length} {objectives.length === 1 ? "objetivo" : "objetivos"}
        </span>
      }
      items={objectives.map((o) => ({
        id: o.id,
        label: o.title,
        href: `#definition-objective-${o.id}`,
        content: (
          <span className="flex items-start gap-2">
            <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${color.dot}`} aria-hidden />
            <span className="min-w-0">
              <span className="block font-medium text-slate-900">{o.title}</span>
              {o.description && <span className="mt-0.5 block text-xs text-slate-500">{o.description}</span>}
            </span>
          </span>
        ),
      }))}
    />
  );
}
