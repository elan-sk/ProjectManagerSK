"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteObjective } from "./definitionActions";
import { ModalTrigger } from "@/components/Modal";
import { ObjectiveForm } from "./ObjectiveForm";
import { RequirementForm } from "./RequirementForm";
import { ProgressRing } from "@/components/ProgressRing";
import { ReferencePopover } from "@/components/ReferencePopover";
import { ScheduleVarianceBadge } from "@/components/ProjectSummary";
import { useConfirm } from "@/components/Confirm";
import { pctStatus } from "@/lib/statusColors";
import type { ObjectiveSummary, RequirementSummary } from "@/lib/cascadeProgress";

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

export function ObjectivesPanel({
  projectId,
  objectives,
  requirements,
  canManage,
}: {
  projectId: string;
  objectives: ObjectiveSummary[];
  requirements: RequirementSummary[];
  canManage: boolean;
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
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-slate-900">Objetivos</h2>
        {canManage && (
          <ModalTrigger label="+ Objetivo" title="Nuevo objetivo" variant="secondary" compact>
            <ObjectiveForm projectId={projectId} />
          </ModalTrigger>
        )}
      </div>
      {objectives.length === 0 && <p className="text-sm text-slate-400">Todavía no hay objetivos definidos.</p>}
      <ul className="space-y-2">
        {objectives.map((o) => (
          <li key={o.id} className="rounded-lg border border-slate-100 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{o.title}</p>
                {o.description && <p className="mt-0.5 text-sm text-slate-500">{o.description}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <div className="flex items-center gap-2">
                  <ProgressRing pct={o.pct} overdue={o.atRiskRequirementCount > 0} size={28} />
                  <div className="text-xs text-slate-500">
                    <p className="whitespace-nowrap">
                      {o.requirementTitles.length} requerimiento{o.requirementTitles.length === 1 ? "" : "s"}
                    </p>
                    {o.atRiskRequirementCount > 0 ? (
                      <ReferencePopover
                        trigger={
                          <span className="mt-0.5 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium bg-red-50 text-red-700">
                            {o.atRiskRequirementCount} en riesgo
                          </span>
                        }
                        hoverText={`Tareas atrasadas: ${o.atRiskTasks.map((t) => t.title).join(", ")}`}
                        items={o.atRiskTasks.map((t) => ({ id: t.id, label: t.title, href: t.href }))}
                      />
                    ) : (
                      o.openSlackDays !== null && (
                        <span
                          className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${
                            o.openSlackDays <= 2 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {o.openSlackDays}d de holgura
                        </span>
                      )
                    )}
                    <ScheduleVarianceBadge days={o.scheduleVarianceDays} />
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-2 border-l border-slate-100 pl-4">
                    <ModalTrigger label="Editar" title="Editar objetivo" variant="secondary" compact>
                      <ObjectiveForm projectId={projectId} objectiveId={o.id} currentTitle={o.title} currentDescription={o.description} />
                    </ModalTrigger>
                    <button
                      type="button"
                      onClick={() => handleDelete(o.id, o.title)}
                      disabled={isPending && deletingId === o.id}
                      className="text-xs font-medium text-slate-400 hover:text-red-600 disabled:opacity-60"
                    >
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-2">
              <ProgressBar pct={o.pct} />
            </div>
            <div className="mt-3 border-t border-slate-100 pt-2">
              <p className="text-xs font-medium text-slate-600">Requerimientos</p>
              {o.requirementIds.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                  {o.requirementIds.map((id, i) => {
                    const title = o.requirementTitles[i];
                    const req = requirementById.get(id);
                    const status = req ? pctStatus(req.pct, req.atRiskPhaseCount > 0) : null;
                    const rowClass = `flex items-baseline justify-between gap-2 rounded px-1.5 py-1 ${i % 2 === 0 ? "bg-slate-50" : ""}`;
                    const statusBadge = status && (
                      <span className={`shrink-0 whitespace-nowrap rounded px-1 py-0.5 text-[10px] font-medium ${status.className}`}>
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
                          <ModalTrigger label={title} title="Editar requerimiento" compact>
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
                <p className="mt-1 text-xs text-slate-400">Sin requerimientos vinculados todavía.</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
