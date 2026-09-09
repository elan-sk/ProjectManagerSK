"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteRequirement } from "./definitionActions";
import { ModalTrigger } from "@/components/Modal";
import { RequirementForm } from "./RequirementForm";
import { ProgressRing } from "@/components/ProgressRing";
import { ReferencePopover } from "@/components/ReferencePopover";
import type { RequirementSummary } from "@/lib/cascadeProgress";

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
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleDelete(id: string, title: string) {
    if (!confirm(`¿Eliminar el requerimiento "${title}"? Esta acción no se puede deshacer.`)) return;
    setDeletingId(id);
    startTransition(async () => {
      await deleteRequirement(id);
      setDeletingId(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-slate-900">Requerimientos</h2>
        {canManage && (
          <ModalTrigger label="+ Requerimiento" title="Nuevo requerimiento" variant="secondary" compact>
            <RequirementForm projectId={projectId} objectives={objectives} />
          </ModalTrigger>
        )}
      </div>
      {requirements.length === 0 && <p className="text-sm text-slate-400">Todavía no hay requerimientos definidos.</p>}
      <ul className="space-y-2">
        {requirements.map((r) => (
          <li key={r.id} className="rounded-lg border border-slate-100 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{r.title}</p>
                {r.description && <p className="mt-0.5 text-sm text-slate-500">{r.description}</p>}
                <p className="mt-1 text-xs text-slate-400">
                  {r.objectiveTitles.length > 0 ? `Atiende: ${r.objectiveTitles.join(", ")}` : "Sin objetivo vinculado todavía."}
                </p>
                <p className="text-xs text-slate-400">
                  {r.phases.length > 0
                    ? `Fases: ${r.phases.map((p) => p.name).join(", ")}`
                    : "Sin fase vinculada todavía (vinculalo desde la fase en Fases y avance)."}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                <ProgressRing pct={r.pct} overdue={r.atRiskPhaseCount > 0} />
                <span>
                  {r.phases.length} fase{r.phases.length === 1 ? "" : "s"}
                  {r.atRiskPhaseCount > 0 && (
                    <ReferencePopover
                      trigger={<span className="text-red-600"> · {r.atRiskPhaseCount} en riesgo</span>}
                      hoverText={`Tareas atrasadas: ${r.atRiskTasks.map((t) => t.title).join(", ")}`}
                      items={r.atRiskTasks.map((t) => ({ id: t.id, label: t.title, href: t.href }))}
                    />
                  )}
                </span>
              </div>
              {canManage && (
                <div className="flex flex-shrink-0 items-center gap-2">
                  <ModalTrigger label="Editar" title="Editar requerimiento" variant="secondary" compact>
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
                    className="text-xs font-medium text-slate-400 hover:text-red-600 disabled:opacity-60"
                  >
                    Eliminar
                  </button>
                </div>
              )}
            </div>
            <div className="mt-2">
              <ProgressBar pct={r.pct} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
