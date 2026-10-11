import { DEFINITION_ACTION_BTN } from "@/lib/statusColors";
import { linkifyHtml } from "@/lib/linkify";
import { ModalTrigger } from "@/components/Modal";
import { ProjectIcon } from "@/components/ProjectIcon";
import { CollapsibleContent } from "@/components/CollapsibleContent";
import { ProjectDescription } from "./ProjectDescription";
import { ProjectIdentityForm } from "./ProjectIdentityForm";
import { ObjectivesPanel } from "./ObjectivesPanel";
import { RequirementsPanel } from "./RequirementsPanel";
import { PhasesPanel } from "./PhasesPanel";
import { ProjectWhatsAppGroupPanel } from "./ProjectWhatsAppGroupPanel";
import { SubprojectsPanel } from "./SubprojectsPanel";
import { DefinitionSummary } from "./DefinitionSummary";
import type { ComponentProps } from "react";
import type { ObjectiveSummary, RequirementSummary, PhaseSummary, TaskRef, UnassignedTask } from "@/lib/cascadeProgress";
import type { TaskStatus } from "@prisma/client";

export function DefinitionTab({
  projectId,
  name,
  iconUrl,
  clientName,
  description,
  canManage,
  objectives,
  requirements,
  phases,
  unassignedTasks,
  whatsappGroupJid,
  subprojects,
  parentObjectives,
  taskProgress,
}: {
  projectId: string;
  name: string;
  iconUrl: string | null;
  clientName: string | null;
  description: string | null;
  canManage: boolean;
  whatsappGroupJid: string | null;
  objectives: ObjectiveSummary[];
  requirements: RequirementSummary[];
  phases: (PhaseSummary & {
    requirementTitles: string[];
    requirementIds: string[];
    tasks: (TaskRef & { status: TaskStatus; requirementIds: string[] })[];
    taskCounts: { completed: number; total: number; overdue: number };
    dueInDays: number | null;
    dueTasks: TaskRef[];
  })[];
  unassignedTasks: UnassignedTask[];
  /** Spec 004: bloque Subproyectos (o «Subproyecto de…»). */
  subprojects: Omit<ComponentProps<typeof SubprojectsPanel>, "projectId" | "canManage">;
  parentObjectives?: { id: string; title: string }[];
  /** Tareas completadas / total (en un principal, de todo el grupo). */
  taskProgress: { completed: number; total: number };
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <ProjectIcon name={name} iconUrl={iconUrl} parent={subprojects.parent} size="h-12 w-12 text-[18px]" projectId={projectId} toParent />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-[18px] font-medium text-slate-900">Descripción</p>
            {canManage ? (
              <ProjectDescription projectId={projectId} description={description} />
            ) : (
              description ? (
                <CollapsibleContent>
                  <div className="prose prose-lg max-w-none text-slate-600" dangerouslySetInnerHTML={{ __html: linkifyHtml(description) }} />
                </CollapsibleContent>
              ) : (
                <p className="text-[18px] text-slate-400">Sin descripción todavía.</p>
              )
            )}
          </div>
        </div>
        {canManage && (
          <ModalTrigger label="Configuración" title="Configuración del proyecto" variant="secondary" compact className={DEFINITION_ACTION_BTN}>
            <ProjectIdentityForm projectId={projectId} name={name} iconUrl={iconUrl} clientName={clientName} />
            <div className="mt-4 border-t border-slate-100 pt-4">
              <ProjectWhatsAppGroupPanel projectId={projectId} currentGroupJid={whatsappGroupJid} />
            </div>
          </ModalTrigger>
        )}
      </div>

      <SubprojectsPanel projectId={projectId} canManage={canManage} {...subprojects} />

      <DefinitionSummary
        taskProgress={taskProgress}
        objectives={objectives.map((o) => ({ id: o.id, label: o.title, pct: o.pct, atRisk: o.atRiskRequirementCount > 0 }))}
        requirements={requirements.map((r) => ({ id: r.id, label: r.title, pct: r.pct, atRisk: r.atRisk }))}
        phases={phases.map((p) => ({ id: p.id, label: p.name, pct: p.pct, atRisk: p.atRisk }))}
        unassignedTasks={unassignedTasks}
        subprojects={subprojects.subprojects.map((s) => ({ id: s.id, label: s.name, pct: s.pct, atRisk: false }))}
      />

      <ObjectivesPanel projectId={projectId} objectives={objectives} requirements={requirements} canManage={canManage} parentObjectives={parentObjectives} />

      <RequirementsPanel
        projectId={projectId}
        requirements={requirements}
        objectives={objectives.map((o) => ({ id: o.id, title: o.title, description: o.description }))}
        phases={phases.map((p) => ({ id: p.id, name: p.name, tasks: p.tasks.map((t) => ({ id: t.id, title: t.title, requirementIds: t.requirementIds })) }))}
        canManage={canManage}
      />

      <PhasesPanel
        requirements={requirements.map((r) => ({ id: r.id, title: r.title, description: r.description }))}
        canManage={canManage}
        phases={phases}
      />
    </div>
  );
}
