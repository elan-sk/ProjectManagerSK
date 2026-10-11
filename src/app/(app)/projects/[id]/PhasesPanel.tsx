"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deletePhase } from "./definitionActions";
import { ModalTrigger } from "@/components/Modal";
import { PhaseForm } from "./PhaseForm";
import { ReferencePopover } from "@/components/ReferencePopover";
import { ChildCount, DefinitionCardHeading, DefinitionProgressBar, ServedLinks } from "./DefinitionParts";
import { ScheduleVarianceBadge } from "@/components/ProjectSummary";
import { useConfirm } from "@/components/Confirm";
import { TASK_STATUS_LABEL, TASK_STATUS_COLOR, DEFINITION_LEVEL_COLOR, DEFINITION_ACTION_BTN, DEFINITION_ACTION_BTN_DANGER } from "@/lib/statusColors";
import type { PhaseSummary, TaskRef } from "@/lib/cascadeProgress";
import type { TaskStatus } from "@prisma/client";

export function PhasesPanel({
  canManage,
  phases,
  requirements,
}: {
  canManage: boolean;
  requirements: { id: string; title: string; description: string | null }[];
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
      <h2 className={`flex items-center gap-1.5 text-[21px] font-semibold ${DEFINITION_LEVEL_COLOR.PHASE.text}`}>
        <span className={`h-2 w-2 rounded-full ${DEFINITION_LEVEL_COLOR.PHASE.dot}`} aria-hidden />
        Fases y avance
      </h2>
      {error && <p className="text-[18px] text-red-600">{error}</p>}
      {phases.length === 0 && <p className="text-[18px] text-slate-400">Todavía no hay fases creadas.</p>}
      <ul className="space-y-4">
        {phases.map((p, index) => (
          <li key={p.id} id={`definition-phase-${p.id}`} tabIndex={-1} className="scroll-mt-24 rounded-lg border border-slate-100 p-3 target:border-teal-600">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <div className="min-w-0 flex-1">
                <DefinitionCardHeading level="PHASE" number={index + 1} title={p.name} aside={<ServedLinks level="REQUIREMENT" items={requirements.filter((r) => p.requirementIds.includes(r.id))} />} />
              </div>
              <div className="flex flex-row-reverse items-start justify-between gap-2 sm:shrink-0 sm:flex-col-reverse sm:items-end sm:justify-start sm:gap-3.5">
                <div className="flex items-start gap-2">
                  <div className="flex flex-col items-end gap-1 text-[14px] text-slate-500">
                    {p.taskCounts.overdue > 0 ? (
                      <ReferencePopover
                        align="right"
                        width={320}
                        trigger={
                          <span className="inline-block rounded px-1.5 py-0.5 text-[11px] font-medium bg-red-50 text-red-700">
                            {p.taskCounts.overdue} atrasada{p.taskCounts.overdue === 1 ? "" : "s"}
                          </span>
                        }
                        hoverText={`Tareas atrasadas: ${p.overdueTasks.map((t) => t.title).join(", ")}`}
                        items={p.overdueTasks.map((t) => ({ id: t.id, label: t.title, href: t.href }))}
                      />
                    ) : (
                      p.dueInDays !== null && (
                        <ReferencePopover
                          align="right"
                          width={320}
                          trigger={
                            <span
                              className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ring-slate-900/10 ${
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
                    <ScheduleVarianceBadge days={p.scheduleVarianceDays} hideOnTime />
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-2">
                    <ModalTrigger label="Editar" title="Editar fase" variant="secondary" compact className={DEFINITION_ACTION_BTN}>
                      <PhaseForm phaseId={p.id} currentName={p.name} />
                    </ModalTrigger>
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id, p.name)}
                      disabled={isPending && deletingId === p.id}
                      className={DEFINITION_ACTION_BTN_DANGER}
                    >
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-2.5">
              <DefinitionProgressBar pct={p.pct} level="PHASE" />
            </div>
            <div className={`mt-3 ml-1 border-l-2 pl-4 ${DEFINITION_LEVEL_COLOR.TASK.border}`}>
              <p className={`flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider ${DEFINITION_LEVEL_COLOR.TASK.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${DEFINITION_LEVEL_COLOR.TASK.dot}`} aria-hidden />
                Tareas
                <ChildCount done={p.taskCounts.completed} total={p.taskCounts.total} />
              </p>
              {p.tasks.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-[15px] text-slate-600">
                  {p.tasks.map((t, i) => (
                    <li
                      key={t.id}
                      title={t.title}
                      className={`flex items-baseline justify-between gap-2 rounded px-1.5 py-1 ${i % 2 === 0 ? "bg-slate-50" : ""}`}
                    >
                      <span className="min-w-0">
                        <Link href={t.href} className="hover:text-slate-900 hover:underline">{t.title}</Link>
                      </span>
                      <span className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ring-slate-900/10 ${TASK_STATUS_COLOR[t.status].badge}`}>
                        {TASK_STATUS_LABEL[t.status]}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-[15px] text-slate-400">Sin tareas todavía.</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
