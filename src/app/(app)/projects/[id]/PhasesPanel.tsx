"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deletePhase } from "./definitionActions";
import { ModalTrigger } from "@/components/Modal";
import { PhaseForm } from "./PhaseForm";
import { ProgressRing } from "@/components/ProgressRing";
import { ReferencePopover } from "@/components/ReferencePopover";
import { ScheduleVarianceBadge } from "@/components/ProjectSummary";
import { useConfirm } from "@/components/Confirm";
import { TASK_STATUS_LABEL, TASK_STATUS_COLOR, DEFINITION_LEVEL_COLOR } from "@/lib/statusColors";
import type { PhaseSummary, TaskRef } from "@/lib/cascadeProgress";
import type { TaskStatus } from "@prisma/client";

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

export function PhasesPanel({
  requirements,
  canManage,
  phases,
}: {
  requirements: { id: string; title: string }[];
  canManage: boolean;
  phases: (PhaseSummary & {
    requirementTitles: string[];
    requirementIds: string[];
    tasks: (TaskRef & { status: TaskStatus })[];
    taskCounts: { completed: number; total: number; overdue: number };
    dueInDays: number | null;
    dueTasks: TaskRef[];
  })[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(id: string, name: string) {
    const ok = await confirm(`¿Seguro que querés eliminar la fase "${name}"? No vas a poder deshacer esto.`, {
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    setError(null);
    setDeletingId(id);
    startTransition(async () => {
      const result = await deletePhase(id);
      setDeletingId(null);
      if (!result.ok) setError(result.error ?? "No se pudo eliminar.");
      else router.refresh();
    });
  }

  return (
    <div className={`space-y-3 rounded-xl border-l-4 ${DEFINITION_LEVEL_COLOR.PHASE.border} border-t border-r border-b border-slate-200 bg-white p-4`}>
      <h2 className="flex items-center gap-1.5 font-medium text-slate-900">
        <span className={`h-2 w-2 rounded-full ${DEFINITION_LEVEL_COLOR.PHASE.dot}`} aria-hidden />
        Fases y avance
      </h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {phases.length === 0 && <p className="text-sm text-slate-400">Todavía no hay fases creadas.</p>}
      <ul className="space-y-2">
        {phases.map((p) => (
          <li key={p.id} className="rounded-lg border border-slate-100 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{p.name}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {p.requirementTitles.length > 0 ? `Atiende: ${p.requirementTitles.join(", ")}` : "Sin requerimiento vinculado todavía."}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <div className="flex items-center gap-2">
                  <ProgressRing pct={p.pct} overdue={p.taskCounts.overdue > 0} size={28} />
                  <div className="text-xs text-slate-500">
                    <p className="whitespace-nowrap">
                      {p.taskCounts.total > 0 ? `${p.taskCounts.completed}/${p.taskCounts.total} tareas` : "Sin tareas"}
                    </p>
                    {p.taskCounts.overdue > 0 ? (
                      <ReferencePopover
                        trigger={
                          <span className="mt-0.5 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium bg-red-50 text-red-700">
                            {p.taskCounts.overdue} atrasada{p.taskCounts.overdue === 1 ? "" : "s"}
                          </span>
                        }
                        hoverText={`Tareas atrasadas: ${p.overdueTasks.map((t) => t.title).join(", ")}`}
                        items={p.overdueTasks.map((t) => ({ id: t.id, label: t.title, href: t.href }))}
                      />
                    ) : (
                      p.dueInDays !== null && (
                        <ReferencePopover
                          trigger={
                            <span
                              className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${
                                p.dueInDays <= 2 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                              }`}
                            >
                              vence en {p.dueInDays}d
                            </span>
                          }
                          hoverText={`Define la fecha: ${p.dueTasks.map((t) => t.title).join(", ")}`}
                          items={p.dueTasks.map((t) => ({ id: t.id, label: t.title, href: t.href }))}
                        />
                      )
                    )}
                    <ScheduleVarianceBadge days={p.scheduleVarianceDays} />
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-2 border-l border-slate-100 pl-4">
                    <ModalTrigger label="Editar" title="Editar fase" variant="secondary" compact>
                      <PhaseForm
                        phaseId={p.id}
                        currentName={p.name}
                        requirements={requirements}
                        currentRequirementIds={p.requirementIds}
                      />
                    </ModalTrigger>
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id, p.name)}
                      disabled={isPending && deletingId === p.id}
                      className="text-xs font-medium text-slate-400 hover:text-red-600 disabled:opacity-60"
                    >
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-2">
              <ProgressBar pct={p.pct} />
            </div>
            <div className="mt-3 border-t border-slate-100 pt-2">
              <p className={`flex items-center gap-1.5 text-xs font-medium ${DEFINITION_LEVEL_COLOR.TASK.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${DEFINITION_LEVEL_COLOR.TASK.dot}`} aria-hidden />
                Tareas
              </p>
              {p.tasks.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                  {p.tasks.map((t, i) => (
                    <li
                      key={t.id}
                      title={t.title}
                      className={`flex items-baseline justify-between gap-2 rounded px-1.5 py-1 ${i % 2 === 0 ? "bg-slate-50" : ""}`}
                    >
                      <span className="min-w-0">
                        <Link href={t.href} className="hover:text-slate-900 hover:underline">{t.title}</Link>
                      </span>
                      <span className={`shrink-0 whitespace-nowrap rounded px-1 py-0.5 text-[10px] font-medium ${TASK_STATUS_COLOR[t.status].badge}`}>
                        {TASK_STATUS_LABEL[t.status]}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-slate-400">Sin tareas todavía.</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
