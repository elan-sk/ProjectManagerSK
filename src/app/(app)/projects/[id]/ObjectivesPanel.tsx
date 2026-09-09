"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteObjective } from "./definitionActions";
import { ModalTrigger } from "@/components/Modal";
import { ObjectiveForm } from "./ObjectiveForm";
import { ProgressRing } from "@/components/ProgressRing";
import { ReferencePopover } from "@/components/ReferencePopover";
import type { ObjectiveSummary } from "@/lib/cascadeProgress";

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
  canManage,
}: {
  projectId: string;
  objectives: ObjectiveSummary[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleDelete(id: string, title: string) {
    if (!confirm(`¿Eliminar el objetivo "${title}"? Esta acción no se puede deshacer.`)) return;
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
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{o.title}</p>
                {o.description && <p className="mt-0.5 text-sm text-slate-500">{o.description}</p>}
                <p className="mt-1 text-xs text-slate-400">
                  {o.requirementTitles.length > 0
                    ? `Requerimientos: ${o.requirementTitles.join(", ")}`
                    : "Sin requerimientos vinculados todavía."}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                <ProgressRing pct={o.pct} overdue={o.atRiskRequirementCount > 0} />
                <span>
                  {o.requirementTitles.length} requerimiento{o.requirementTitles.length === 1 ? "" : "s"}
                  {o.atRiskRequirementCount > 0 && (
                    <ReferencePopover
                      trigger={<span className="text-red-600"> · {o.atRiskRequirementCount} en riesgo</span>}
                      hoverText={`Tareas atrasadas: ${o.atRiskTasks.map((t) => t.title).join(", ")}`}
                      items={o.atRiskTasks.map((t) => ({ id: t.id, label: t.title, href: t.href }))}
                    />
                  )}
                </span>
              </div>
              {canManage && (
                <div className="flex flex-shrink-0 items-center gap-2">
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
            <div className="mt-2">
              <ProgressBar pct={o.pct} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
