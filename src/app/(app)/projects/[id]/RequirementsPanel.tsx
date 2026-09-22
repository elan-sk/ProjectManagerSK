"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteRequirement } from "./definitionActions";
import { ModalTrigger } from "@/components/Modal";
import { RequirementForm } from "./RequirementForm";
import { PhaseRequirementsForm } from "./PhaseRequirementsForm";
import { ProgressRing } from "@/components/ProgressRing";
import { ReferencePopover } from "@/components/ReferencePopover";
import { ScheduleVarianceBadge } from "@/components/ProjectSummary";
import { useConfirm } from "@/components/Confirm";
import { pctStatus, DEFINITION_LEVEL_COLOR, DEFINITION_ACTION_BTN, DEFINITION_ACTION_BTN_DANGER } from "@/lib/statusColors";
import type { RequirementSummary } from "@/lib/cascadeProgress";

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 flex-shrink-0 overflow-hidden rounded-xs bg-slate-100">
        <div className="progress-fill-emerald h-full rounded-xs" style={{ width: `${pct}%` }} />
      </div>
      <span className="flex-shrink-0 text-[17px] text-slate-500">{pct}%</span>
    </div>
  );
}

export function RequirementsPanel({
  projectId,
  requirements,
  objectives,
  canManage,
}: {
  projectId: string;
  requirements: RequirementSummary[];
  objectives: { id: string; title: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const requirementOptions = requirements.map((rr) => ({ id: rr.id, title: rr.title }));

  async function handleDelete(id: string, title: string) {
    const ok = await confirm(`¿Seguro que querés eliminar el requerimiento "${title}"? No vas a poder deshacer esto.`, {
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    setDeletingId(id);
    startTransition(async () => {
      await deleteRequirement(id);
      setDeletingId(null);
      router.refresh();
    });
  }

  return (
    <div className={`space-y-3 rounded-xl border-l-4 ${DEFINITION_LEVEL_COLOR.REQUIREMENT.border} border-t border-r border-b border-slate-200 bg-white p-4`}>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-[21px] font-semibold text-slate-900">
          <span className={`h-2 w-2 rounded-full ${DEFINITION_LEVEL_COLOR.REQUIREMENT.dot}`} aria-hidden />
          Requerimientos
        </h2>
        {canManage && (
          <ModalTrigger label="+ Requerimiento" title="Nuevo requerimiento" variant="secondary" compact className={DEFINITION_ACTION_BTN}>
            <RequirementForm projectId={projectId} objectives={objectives} />
          </ModalTrigger>
        )}
      </div>
      {requirements.length === 0 && <p className="text-[18px] text-slate-400">Todavía no hay requerimientos definidos.</p>}
      <ul className="space-y-2">
        {requirements.map((r) => (
          <li key={r.id} className="rounded-lg border border-slate-100 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{r.title}</p>
                {r.description && <p className="mt-0.5 text-[18px] text-slate-500">{r.description}</p>}
                <p className="mt-1 text-[17px] text-slate-400">
                  {r.objectiveTitles.length > 0 ? `Atiende: ${r.objectiveTitles.join(", ")}` : "Sin objetivo vinculado todavía."}
                </p>
              </div>
              <div className="flex shrink-0 items-start gap-4">
                <div className="flex items-center gap-2">
                  <ProgressRing pct={r.pct} overdue={r.atRiskPhaseCount > 0} size={28} />
                  <div className="text-[17px] text-slate-500 flex flex-col gap-1">
                    <p className="whitespace-nowrap">
                      {r.phases.length} fase{r.phases.length === 1 ? "" : "s"}
                    </p>
                    {r.atRiskPhaseCount > 0 ? (
                      <ReferencePopover
                        trigger={
                          <span className="mt-0.5 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium bg-red-50 text-red-700">
                            {r.atRiskPhaseCount} en riesgo
                          </span>
                        }
                        hoverText={`Tareas atrasadas: ${r.atRiskTasks.map((t) => t.title).join(", ")}`}
                        items={r.atRiskTasks.map((t) => ({ id: t.id, label: t.title, href: t.href }))}
                      />
                    ) : (
                      r.openSlackDays !== null && (
                        <span
                          className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${
                            r.openSlackDays <= 2 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {r.openSlackDays}d de holgura
                        </span>
                      )
                    )}
                    <ScheduleVarianceBadge days={r.scheduleVarianceDays} />
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-2 border-l border-slate-100 pl-4">
                    <ModalTrigger label="Editar" title="Editar requerimiento" variant="secondary" compact className={DEFINITION_ACTION_BTN}>
                      <RequirementForm
                        projectId={projectId}
                        objectives={objectives}
                        requirementId={r.id}
                        currentTitle={r.title}
                        currentDescription={r.description}
                        currentObjectiveIds={r.objectiveIds}
                      />
                    </ModalTrigger>
                    <button
                      type="button"
                      onClick={() => handleDelete(r.id, r.title)}
                      disabled={isPending && deletingId === r.id}
                      className={DEFINITION_ACTION_BTN_DANGER}
                    >
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-2">
              <ProgressBar pct={r.pct} />
            </div>
            <div className="mt-3 border-t border-slate-100 pt-2">
              <p className={`flex items-center gap-1.5 text-[17px] font-medium ${DEFINITION_LEVEL_COLOR.PHASE.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${DEFINITION_LEVEL_COLOR.PHASE.dot}`} aria-hidden />
                Fases
              </p>
              {r.phases.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-[17px] text-slate-500">
                  {r.phases.map((p, i) => {
                    const status = pctStatus(p.pct, p.atRisk);
                    return (
                      <li
                        key={p.id}
                        title={p.name}
                        className={`flex items-baseline justify-between gap-2 rounded px-1.5 py-1 ${i % 2 === 0 ? "bg-slate-50" : ""}`}
                      >
                        <span className="min-w-0">
                          {canManage ? (
                            <ModalTrigger label={p.name} title="Requerimientos de la fase" compact>
                              <PhaseRequirementsForm
                                phaseId={p.id}
                                requirements={requirementOptions}
                                currentRequirementIds={p.requirementIds}
                              />
                            </ModalTrigger>
                          ) : (
                            p.name
                          )}
                        </span>
                        <span className={`shrink-0 whitespace-nowrap rounded px-1 py-0.5 text-[10px] font-medium ${status.className}`}>
                          {status.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-1 text-[17px] text-slate-400">Sin fase vinculada todavía (vinculalo desde la fase en Fases y avance).</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
