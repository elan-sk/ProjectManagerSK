import Link from "next/link";
import { ModalTrigger } from "@/components/Modal";
import { ProjectIcon } from "@/components/ProjectIcon";
import { ProjectDescription } from "./ProjectDescription";
import { ProjectIdentityForm } from "./ProjectIdentityForm";
import { ObjectivesPanel } from "./ObjectivesPanel";
import { RequirementsPanel } from "./RequirementsPanel";
import { PhaseRequirementsForm } from "./PhaseRequirementsForm";
import { ProgressRing } from "@/components/ProgressRing";
import { ReferencePopover } from "@/components/ReferencePopover";
import type { ObjectiveSummary, RequirementSummary, PhaseSummary, TaskRef } from "@/lib/cascadeProgress";

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

export function DefinitionTab({
  projectId,
  name,
  color,
  iconUrl,
  description,
  canManage,
  objectives,
  requirements,
  phases,
}: {
  projectId: string;
  name: string;
  color: string | null;
  iconUrl: string | null;
  description: string | null;
  canManage: boolean;
  objectives: ObjectiveSummary[];
  requirements: RequirementSummary[];
  phases: (PhaseSummary & {
    requirementTitles: string[];
    requirementIds: string[];
    tasks: TaskRef[];
    taskCounts: { completed: number; total: number; overdue: number };
    dueInDays: number | null;
    dueTasks: TaskRef[];
  })[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <ProjectIcon name={name} iconUrl={iconUrl} size="h-12 w-12 text-base" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-medium text-slate-900">Descripción</p>
            {canManage ? (
              <ProjectDescription projectId={projectId} description={description} />
            ) : (
              description ? (
                <div className="prose prose-sm max-w-none text-slate-600" dangerouslySetInnerHTML={{ __html: description }} />
              ) : (
                <p className="text-sm text-slate-400">Sin descripción todavía.</p>
              )
            )}
          </div>
        </div>
        {canManage && (
          <ModalTrigger label="Ícono y color" title="Identidad del proyecto" variant="secondary" compact>
            <ProjectIdentityForm projectId={projectId} name={name} color={color} iconUrl={iconUrl} />
          </ModalTrigger>
        )}
      </div>

      <ObjectivesPanel projectId={projectId} objectives={objectives} requirements={requirements} canManage={canManage} />

      <RequirementsPanel
        projectId={projectId}
        requirements={requirements}
        objectives={objectives.map((o) => ({ id: o.id, title: o.title }))}
        canManage={canManage}
      />

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-medium text-slate-900">Fases y avance</h2>
        {phases.length === 0 && <p className="text-sm text-slate-400">Todavía no hay fases creadas.</p>}
        <ul className="space-y-2">
          {phases.map((p) => (
            <li key={p.id} className="grid grid-cols-1 gap-3 rounded-lg border border-slate-100 p-3 sm:grid-cols-[minmax(0,1fr)_200px]">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{p.name}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {p.requirementTitles.length > 0 ? `Atiende: ${p.requirementTitles.join(", ")}` : "Sin requerimiento vinculado todavía."}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                    <ProgressRing pct={p.pct} overdue={p.taskCounts.overdue > 0} />
                    <span>
                      {p.taskCounts.total > 0 ? `${p.taskCounts.completed}/${p.taskCounts.total} tareas` : "Sin tareas"}
                      {p.taskCounts.overdue > 0 ? (
                        <ReferencePopover
                          trigger={
                            <span className="text-red-600"> · {p.taskCounts.overdue} atrasada{p.taskCounts.overdue === 1 ? "" : "s"}</span>
                          }
                          hoverText={`Tareas atrasadas: ${p.overdueTasks.map((t) => t.title).join(", ")}`}
                          items={p.overdueTasks.map((t) => ({ id: t.id, label: t.title, href: t.href }))}
                        />
                      ) : (
                        p.dueInDays !== null && (
                          <ReferencePopover
                            trigger={<span className={p.dueInDays <= 2 ? "text-amber-600" : undefined}> · vence en {p.dueInDays}d</span>}
                            hoverText={`Define la fecha: ${p.dueTasks.map((t) => t.title).join(", ")}`}
                            items={p.dueTasks.map((t) => ({ id: t.id, label: t.title, href: t.href }))}
                          />
                        )
                      )}
                    </span>
                  </div>
                  {canManage && (
                    <ModalTrigger label="Vincular" title="Requerimientos de la fase" variant="secondary" compact>
                      <PhaseRequirementsForm
                        phaseId={p.id}
                        requirements={requirements.map((r) => ({ id: r.id, title: r.title }))}
                        currentRequirementIds={p.requirementIds}
                      />
                    </ModalTrigger>
                  )}
                </div>
                <div className="mt-2">
                  <ProgressBar pct={p.pct} />
                </div>
              </div>
              <div className="border-t border-slate-100 pt-2 text-xs text-slate-500 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                <p className="font-medium text-slate-600">Tareas</p>
                {p.tasks.length > 0 ? (
                  <ul className="mt-1 space-y-0.5">
                    {p.tasks.map((t) => (
                      <li key={t.id} title={t.title}>
                        · <Link href={t.href} className="hover:text-slate-900 hover:underline">{t.title}</Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-slate-400">Sin tareas todavía.</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
