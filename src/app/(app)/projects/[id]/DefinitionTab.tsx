import { ModalTrigger } from "@/components/Modal";
import { ProjectIcon } from "@/components/ProjectIcon";
import { ProjectDescription } from "./ProjectDescription";
import { ProjectIdentityForm } from "./ProjectIdentityForm";
import { ObjectivesPanel } from "./ObjectivesPanel";
import { RequirementsPanel } from "./RequirementsPanel";
import { PhasesPanel } from "./PhasesPanel";
import { ProjectLinksPanel } from "./ProjectLinksPanel";
import { ProjectWhatsAppGroupPanel } from "./ProjectWhatsAppGroupPanel";
import type { ObjectiveSummary, RequirementSummary, PhaseSummary, TaskRef } from "@/lib/cascadeProgress";
import type { TaskStatus } from "@prisma/client";

export function DefinitionTab({
  projectId,
  name,
  iconUrl,
  description,
  canManage,
  objectives,
  requirements,
  phases,
  links,
  attachments,
  whatsappGroupJid,
}: {
  projectId: string;
  name: string;
  iconUrl: string | null;
  description: string | null;
  canManage: boolean;
  whatsappGroupJid: string | null;
  objectives: ObjectiveSummary[];
  requirements: RequirementSummary[];
  phases: (PhaseSummary & {
    requirementTitles: string[];
    requirementIds: string[];
    tasks: (TaskRef & { status: TaskStatus })[];
    taskCounts: { completed: number; total: number; overdue: number };
    dueInDays: number | null;
    dueTasks: TaskRef[];
  })[];
  links: { id: string; title: string; url: string }[];
  attachments: { id: string; fileName: string; fileUrl: string; mimeType: string }[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <ProjectIcon name={name} iconUrl={iconUrl} size="h-12 w-12 text-base" projectId={projectId} />
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
          <ModalTrigger label="Icono y nombre" title="Identidad del proyecto" variant="secondary" compact>
            <ProjectIdentityForm projectId={projectId} name={name} iconUrl={iconUrl} />
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

      <PhasesPanel
        requirements={requirements.map((r) => ({ id: r.id, title: r.title }))}
        canManage={canManage}
        phases={phases}
      />

      <ProjectLinksPanel projectId={projectId} links={links} attachments={attachments} canManage={canManage} />

      {canManage && <ProjectWhatsAppGroupPanel projectId={projectId} currentGroupJid={whatsappGroupJid} />}
    </div>
  );
}
