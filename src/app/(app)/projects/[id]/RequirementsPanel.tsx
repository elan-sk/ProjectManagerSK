"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteRequirement } from "./definitionActions";
import { ModalTrigger } from "@/components/Modal";
import { RequirementForm } from "./RequirementForm";
import Link from "next/link";
import { RequirementTasksForm } from "./RequirementTasksForm";
import { ChildCount, DefinitionCardHeading, DefinitionProgressBar, ServedObjectives } from "./DefinitionParts";
import { ReferencePopover } from "@/components/ReferencePopover";
import { ScheduleVarianceBadge } from "@/components/ProjectSummary";
import { useConfirm } from "@/components/Confirm";
import { pctStatus, TASK_STATUS_LABEL, TASK_STATUS_COLOR, DEFINITION_LEVEL_COLOR, DEFINITION_ACTION_BTN, DEFINITION_ACTION_BTN_DANGER } from "@/lib/statusColors";
import type { RequirementSummary } from "@/lib/cascadeProgress";

export function RequirementsPanel({
  projectId,
  requirements,
  objectives,
  phases,
  canManage,
}: {
  projectId: string;
  requirements: RequirementSummary[];
  objectives: { id: string; title: string; description: string | null }[];
  phases: { id: string; name: string; tasks: { id: string; title: string; requirementIds: string[] }[] }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const requirementTitles = Object.fromEntries(requirements.map((rr) => [rr.id, rr.title]));

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
      <ul className="space-y-4">
        {requirements.map((r, index) => (
          <li key={r.id} id={`definition-requirement-${r.id}`} tabIndex={-1} className="scroll-mt-24 rounded-lg border border-slate-100 p-3 target:border-teal-600">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <div className="min-w-0 flex-1">
                <DefinitionCardHeading level="REQUIREMENT" number={index + 1} title={r.title} aside={<ServedObjectives objectives={objectives.filter((o) => r.objectiveIds.includes(o.id))} />} />
                {r.description && <p className="mt-1 text-[16px] text-slate-500">{r.description}</p>}
              </div>
              <div className="flex flex-row-reverse items-start justify-between gap-2 sm:shrink-0 sm:flex-col-reverse sm:items-end sm:justify-start sm:gap-3.5">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col items-end gap-1 text-[14px] text-slate-500">
                    {r.atRisk ? (
                      <ReferencePopover
                        align="right"
                        width={320}
                        trigger={
                          <span className="inline-block rounded px-1.5 py-0.5 text-[11px] font-medium bg-red-50 text-red-700">
                            {r.atRiskTasks.length} atrasada{r.atRiskTasks.length === 1 ? "" : "s"}
                          </span>
                        }
                        hoverText={`Tareas atrasadas: ${r.atRiskTasks.map((t) => t.title).join(", ")}`}
                        items={r.atRiskTasks.map((t) => ({ id: t.id, label: t.title, href: t.href }))}
                      />
                    ) : (
                      r.openSlackDays !== null && (
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ring-slate-900/10 ${
                            r.openSlackDays <= 2 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {r.openSlackDays}d de holgura
                        </span>
                      )
                    )}
                    <ScheduleVarianceBadge days={r.scheduleVarianceDays} hideOnTime />
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-2">
                    <ModalTrigger label="Tareas" title={`Tareas de «${r.title}»`} variant="secondary" compact className={DEFINITION_ACTION_BTN}>
                      <RequirementTasksForm requirementId={r.id} phases={phases} requirementTitles={requirementTitles} />
                    </ModalTrigger>
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
            <div className="mt-2.5">
              <DefinitionProgressBar pct={r.pct} atRisk={r.atRisk} />
            </div>
            <div className={`mt-3 ml-1 border-l-2 pl-4 ${DEFINITION_LEVEL_COLOR.TASK.border}`}>
              {r.usesPhaseFallback ? (
                <>
                  <p className={`flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider ${DEFINITION_LEVEL_COLOR.PHASE.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${DEFINITION_LEVEL_COLOR.PHASE.dot}`} aria-hidden />
                    Fases
                    <ChildCount done={r.phases.filter((p) => p.pct >= 100).length} total={r.phases.length} />
                  </p>
                  {r.phases.length > 0 ? (
                    <ul className="mt-1 space-y-0.5 text-[15px] text-slate-600">
                      {r.phases.map((p, i) => {
                        const status = pctStatus(p.pct, p.atRisk);
                        return (
                          <li key={p.id} title={p.name} className={`flex items-baseline justify-between gap-2 rounded px-1.5 py-1 ${i % 2 === 0 ? "bg-slate-50" : ""}`}>
                            <span className="min-w-0">{p.name}</span>
                            <span className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ring-slate-900/10 ${status.className}`}>{status.label}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                  <p className="mt-1 text-[15px] text-slate-400">Sin tareas vinculadas todavía.</p>
                </>
              ) : (
                <>
                  <p className={`flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider ${DEFINITION_LEVEL_COLOR.TASK.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${DEFINITION_LEVEL_COLOR.TASK.dot}`} aria-hidden />
                    Tareas
                    <ChildCount done={r.tasks.filter((t) => t.status === "COMPLETED").length} total={r.tasks.length} />
                  </p>
                  {r.phases.map((p) => (
                    <div key={p.id} className="mt-1.5">
                      <p className={`flex items-center gap-1.5 text-[14px] font-semibold ${DEFINITION_LEVEL_COLOR.PHASE.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${DEFINITION_LEVEL_COLOR.PHASE.dot}`} aria-hidden />
                        {p.name}
                      </p>
                      <ul className="mt-0.5 space-y-0.5 pl-3 text-[15px] text-slate-600">
                        {r.tasks
                          .filter((t) => t.phaseId === p.id)
                          .map((t, i) => (
                            <li key={t.id} title={t.title} className={`flex items-baseline justify-between gap-2 rounded px-1.5 py-1 ${i % 2 === 0 ? "bg-slate-50" : ""}`}>
                              <span className="min-w-0">
                                <Link href={t.href} className="hover:text-slate-900 hover:underline">
                                  {t.title}
                                </Link>
                              </span>
                              <span className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ring-slate-900/10 ${TASK_STATUS_COLOR[t.status].badge}`}>
                                {TASK_STATUS_LABEL[t.status]}
                              </span>
                            </li>
                          ))}
                      </ul>
                    </div>
                  ))}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
