"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteObjective } from "./definitionActions";
import { ModalTrigger } from "@/components/Modal";
import { ObjectiveForm } from "./ObjectiveForm";
import { ProjectIcon } from "@/components/ProjectIcon";
import Link from "next/link";
import { RequirementForm } from "./RequirementForm";
import { ReferencePopover } from "@/components/ReferencePopover";
import { ChildCount, DefinitionCardHeading, DefinitionProgressBar } from "./DefinitionParts";
import { ScheduleVarianceBadge } from "@/components/ProjectSummary";
import { useConfirm } from "@/components/Confirm";
import { pctStatus, DEFINITION_LEVEL_COLOR, DEFINITION_ACTION_BTN, DEFINITION_ACTION_BTN_DANGER } from "@/lib/statusColors";
import type { ObjectiveSummary, RequirementSummary } from "@/lib/cascadeProgress";

export function ObjectivesPanel({
  projectId,
  objectives,
  requirements,
  canManage,
  parentObjectives,
}: {
  projectId: string;
  objectives: ObjectiveSummary[];
  requirements: RequirementSummary[];
  canManage: boolean;
  /** Subproyecto (spec 004): objetivos del proyecto principal a los que se puede aportar. */
  parentObjectives?: { id: string; title: string }[];
}) {
  const objectiveOptions = objectives.map((o) => ({ id: o.id, title: o.title }));
  const requirementById = new Map(requirements.map((r) => [r.id, r]));
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string, title: string) {
    const ok = await confirm(`¿Seguro que querés eliminar el objetivo "${title}"? No vas a poder deshacer esto.`, {
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    setDeletingId(id);
    startTransition(async () => {
      await deleteObjective(id);
      setDeletingId(null);
      router.refresh();
    });
  }

  return (
    <div className={`space-y-3 rounded-xl border-l-4 ${DEFINITION_LEVEL_COLOR.OBJECTIVE.border} border-t border-r border-b border-slate-200 bg-white p-4`}>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-[21px] font-semibold text-slate-900">
          <span className={`h-2 w-2 rounded-full ${DEFINITION_LEVEL_COLOR.OBJECTIVE.dot}`} aria-hidden />
          Objetivos
        </h2>
        {canManage && (
          <ModalTrigger label="+ Objetivo" title="Nuevo objetivo" variant="secondary" compact className={DEFINITION_ACTION_BTN}>
            <ObjectiveForm projectId={projectId} parentObjectives={parentObjectives} />
          </ModalTrigger>
        )}
      </div>
      {objectives.length === 0 && <p className="text-[18px] text-slate-400">Todavía no hay objetivos definidos.</p>}
      <ul className="space-y-4">
        {objectives.map((o, index) => (
          <li key={o.id} id={`definition-objective-${o.id}`} tabIndex={-1} className="scroll-mt-24 rounded-lg border border-slate-100 p-3 target:border-teal-600">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <div className="min-w-0 flex-1">
                <DefinitionCardHeading level="OBJECTIVE" number={index + 1} title={o.title} />
                {o.description && <p className="mt-1 text-[16px] text-slate-500">{o.description}</p>}
                {o.parentObjectiveTitle && <p className="mt-0.5 text-sm text-slate-400">Contribuye a: {o.parentObjectiveTitle}</p>}
                {o.contributions.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {o.contributions.map((c) => (
                      <li key={c.id} className="flex items-center gap-1.5 text-sm text-slate-600">
                        <ProjectIcon name={c.projectName} iconUrl={c.projectIconUrl} size="h-4 w-4 text-[8px]" />
                        <Link href={`/projects/${c.projectId}?view=definition`} className="min-w-0 truncate hover:underline" title={`${c.projectName} — ${c.title}`}>
                          {c.title}
                        </Link>
                        <span className="flex-shrink-0 text-xs text-slate-400">{c.pct}%</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex flex-row-reverse items-start justify-between gap-2 sm:shrink-0 sm:flex-col-reverse sm:items-end sm:justify-start sm:gap-3.5">
                <div className="flex items-start gap-2">
                  <div className="flex flex-col items-end gap-1 text-[14px] text-slate-500">
                    {o.atRiskRequirementCount > 0 ? (
                      <ReferencePopover
                        align="right"
                        width={320}
                        trigger={
                          <span className="inline-block rounded px-1.5 py-0.5 text-[11px] font-medium bg-red-50 text-red-700">
                            {o.atRiskRequirementCount} en riesgo
                          </span>
                        }
                        hoverText={`Tareas atrasadas: ${o.atRiskTasks.map((t) => t.title).join(", ")}`}
                        items={o.atRiskTasks.map((t) => ({ id: t.id, label: t.title, href: t.href }))}
                      />
                    ) : (
                      o.openSlackDays !== null && (
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ring-slate-900/10 ${
                            o.openSlackDays <= 2 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {o.openSlackDays}d de holgura
                        </span>
                      )
                    )}
                    <ScheduleVarianceBadge days={o.scheduleVarianceDays} hideOnTime />
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-2">
                    <ModalTrigger label="Editar" title="Editar objetivo" variant="secondary" compact className={DEFINITION_ACTION_BTN}>
                      <ObjectiveForm projectId={projectId} objectiveId={o.id} currentTitle={o.title} currentDescription={o.description} parentObjectives={parentObjectives} currentParentObjectiveId={o.parentObjectiveId} />
                    </ModalTrigger>
                    <button
                      type="button"
                      onClick={() => handleDelete(o.id, o.title)}
                      disabled={isPending && deletingId === o.id}
                      className={DEFINITION_ACTION_BTN_DANGER}
                    >
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-2.5">
              <DefinitionProgressBar pct={o.pct} atRisk={o.atRiskRequirementCount > 0} />
            </div>
            <div className={`mt-3 ml-1 border-l-2 pl-4 ${DEFINITION_LEVEL_COLOR.REQUIREMENT.border}`}>
              <p className={`flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider ${DEFINITION_LEVEL_COLOR.REQUIREMENT.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${DEFINITION_LEVEL_COLOR.REQUIREMENT.dot}`} aria-hidden />
                Requerimientos
                <ChildCount done={o.requirementIds.filter((id) => (requirementById.get(id)?.pct ?? 0) >= 100).length} total={o.requirementIds.length} />
              </p>
              {o.requirementIds.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-[15px] text-slate-600">
                  {o.requirementIds.map((id, i) => {
                    const title = o.requirementTitles[i];
                    const req = requirementById.get(id);
                    const status = req ? pctStatus(req.pct, req.atRisk) : null;
                    const rowClass = `flex items-baseline justify-between gap-2 rounded px-1.5 py-1 ${i % 2 === 0 ? "bg-slate-50" : ""}`;
                    const statusBadge = status && (
                      <span className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ring-slate-900/10 ${status.className}`}>
                        {status.label}
                      </span>
                    );
                    if (!canManage || !req) {
                      return (
                        <li key={id} title={title} className={rowClass}>
                          <span className="min-w-0">{title}</span>
                          {statusBadge}
                        </li>
                      );
                    }
                    return (
                      <li key={id} title={title} className={rowClass}>
                        <span className="min-w-0">
                          <ModalTrigger label={title} title="Editar requerimiento" compact className="text-left hover:text-slate-900 hover:underline">
                            <RequirementForm
                              projectId={projectId}
                              objectives={objectiveOptions}
                              requirementId={req.id}
                              currentTitle={req.title}
                              currentDescription={req.description}
                              currentObjectiveIds={req.objectiveIds}
                            />
                          </ModalTrigger>
                        </span>
                        {statusBadge}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-1 text-[15px] text-slate-400">Sin requerimientos vinculados todavía.</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
