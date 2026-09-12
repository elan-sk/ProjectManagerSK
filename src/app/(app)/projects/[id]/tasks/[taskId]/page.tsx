import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTaskDelayDays, getTaskEarlyDays, getTaskAlert, getTaskScheduleVariance } from "@/lib/delays";
import { utcToBogotaLocalInputValue } from "@/lib/workingHours";
import { getProjectAdmin, canEditTask, canReviewTask } from "@/lib/permissions";
import { addStep, setDependency, removeDependency } from "./actions";
import { StepCheckbox } from "./StepCheckbox";
import { AttachmentUploader } from "./AttachmentUploader";
import { AttachmentGrid } from "./AttachmentGrid";
import { AdjustmentPanel } from "./AdjustmentPanel";
import { ReviewPanel } from "./ReviewPanel";
import { GoogleCalendarButton } from "./GoogleCalendarButton";
import { TaskStatusControl } from "./TaskStatusControl";
import { InlineTitle } from "./InlineTitle";
import { InlineDescription } from "./InlineDescription";
import { InlineMeetingUrl } from "./InlineMeetingUrl";
import { InlineType } from "./InlineType";
import { InlinePhase } from "./InlinePhase";
import { ReassignAssigneesForm } from "./ReassignAssigneesForm";
import { DeleteTaskButton } from "./DeleteTaskButton";
import { ModalTrigger } from "@/components/Modal";
import { SearchableSelect } from "@/components/SearchableSelect";
import { AvatarGroup } from "@/components/Avatar";
import { ProjectIcon } from "@/components/ProjectIcon";
import { NavLinkWithMemory } from "../../../../NavLinkWithMemory";
import { getActiveShareLink } from "@/lib/shareLinks";
import { createTaskShareLink, revokeTaskShareLink } from "../../../../shareActions";
import { ShareLinkPanel } from "@/components/ShareLinkPanel";

const DATE_FMT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" };

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>;
}) {
  const { id: projectId, taskId } = await params;
  const session = await auth();

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: true,
      phase: true,
      assignees: { include: { user: true } },
      reviewers: { include: { user: true } },
      steps: { orderBy: { order: "asc" } },
      attachments: { include: { uploadedBy: true }, orderBy: { uploadedAt: "desc" } },
      adjustmentItems: { include: { attachments: true }, orderBy: { order: "asc" } },
      reviewRounds: {
        orderBy: { roundNumber: "desc" },
        include: {
          submittedBy: true,
          deliverables: true,
          checks: { include: { evidence: true, reviewedBy: true }, orderBy: { order: "asc" } },
          messages: { include: { author: true }, orderBy: { createdAt: "asc" } },
        },
      },
      dependsOn: { include: { predecessor: true } },
      blocks: { include: { successor: { select: { id: true, title: true } } } },
    },
  });
  if (!task) notFound();

  const [otherTasks, canManage, canEdit, canReview, users, alert, phases, activeShareLink, testTemplates] = await Promise.all([
    prisma.task.findMany({
      where: { projectId, id: { not: taskId } },
      select: { id: true, title: true },
    }),
    getProjectAdmin(projectId).then(Boolean),
    canEditTask(taskId),
    canReviewTask(taskId),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    getTaskAlert(task.project.countryCode, task),
    prisma.phase.findMany({ where: { projectId }, orderBy: { order: "asc" } }),
    getActiveShareLink("TASK", taskId),
    task.type === "QA" ? prisma.testTemplate.findMany({ orderBy: { createdAt: "asc" } }) : Promise.resolve([]),
  ]);

  const delayDays =
    task.status === "COMPLETED" ? await getTaskDelayDays(task.project.countryCode, task) : 0;
  const earlyDays =
    task.status === "COMPLETED" && delayDays === 0
      ? await getTaskEarlyDays(task.project.countryCode, task)
      : 0;
  const scheduleVariance =
    task.status === "COMPLETED" ? await getTaskScheduleVariance(task.project.countryCode, task) : null;
  // Mismo criterio que getBottlenecks (lib/delays.ts): no completada y (2+
  // sucesoras retenidas, o riesgo alto). Se recalcula acá en vez de llamar a
  // esa función porque acá hace falta el id de cada sucesora para poder
  // linkearla, no solo el texto de la razón.
  const isBottleneck = task.status !== "COMPLETED" && (task.blocks.length >= 2 || task.riskLevel === "HIGH");

  const insumos = task.attachments.filter((a) => a.kind === "INSUMO");
  const resultados = task.attachments.filter((a) => a.kind === "RESULTADO");

  const addStepWithId = addStep.bind(null, taskId);
  const setDependencyWithId = setDependency.bind(null, taskId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <NavLinkWithMemory
          href={`/projects/${projectId}`}
          storageKey={`project:${projectId}`}
          className="text-sm text-slate-500 hover:underline"
        >
          ← {task.project.name}
        </NavLinkWithMemory>
        <div className="mt-1 flex items-center gap-2">
          <ProjectIcon name={task.project.name} iconUrl={task.project.iconUrl} size="h-10 w-10 flex-shrink-0 text-sm" />
          <div className="min-w-0 flex-1">
            <InlineTitle taskId={taskId} title={task.title} canManage={canEdit} />
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
          <span>
            <InlineType taskId={taskId} type={task.type} canManage={canManage} /> · Fase:{" "}
            <InlinePhase taskId={taskId} phaseId={task.phaseId} phaseName={task.phase.name} phases={phases} canManage={canEdit} />{" "}
            · Asignados:
          </span>
          <AvatarGroup
            people={task.assignees.map((a) => ({ name: a.user.name, avatarUrl: a.user.avatarUrl }))}
          />
          {canEdit && (
            <ModalTrigger label="Cambiar" title="Asignar tarea" variant="secondary" compact>
              <ReassignAssigneesForm
                taskId={taskId}
                currentAssigneeIds={task.assignees.map((a) => a.userId)}
                users={users}
              />
            </ModalTrigger>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Planeada: {task.plannedStart.toLocaleDateString("es-CO", DATE_FMT)} —{" "}
          {task.plannedEnd.toLocaleDateString("es-CO", DATE_FMT)}
          {task.actualStart && (
            <>
              {" "}
              · Real: {task.actualStart.toLocaleDateString("es-CO", DATE_FMT)}
              {task.actualEnd ? ` — ${task.actualEnd.toLocaleDateString("es-CO", DATE_FMT)}` : " — en curso"}
            </>
          )}
        </p>
        {delayDays > 0 && (
          <p className="mt-1 text-sm font-medium text-red-600">
            Generó {delayDays} día(s) hábil(es) de atraso propio.
          </p>
        )}
        {earlyDays > 0 && (
          <p className="mt-1 text-sm font-medium text-emerald-600">
            Se adelantó {earlyDays} día(s) hábil(es) (holgura).
          </p>
        )}
        {scheduleVariance !== null && scheduleVariance !== 0 && (
          <p className={`mt-1 text-sm font-medium ${scheduleVariance > 0 ? "text-emerald-600" : "text-red-600"}`}>
            {scheduleVariance > 0
              ? `Terminó ${scheduleVariance} día(s) hábil(es) antes de lo planeado (holgura) — sus sucesoras ya se corrieron.`
              : `Terminó ${Math.abs(scheduleVariance)} día(s) hábil(es) después de lo planeado (retraso) — sus sucesoras ya se corrieron.`}
          </p>
        )}
        {isBottleneck && (
          <p className="mt-1 text-sm font-medium text-amber-600">
            Cuello de botella
            {task.blocks.length >= 2 ? (
              <>
                {" "}
                — retiene {task.blocks.length} tarea{task.blocks.length !== 1 ? "s" : ""}:{" "}
                {task.blocks.map((b, i) => (
                  <span key={b.id}>
                    {i > 0 && ", "}
                    <Link href={`/projects/${projectId}/tasks/${b.successor.id}`} className="underline hover:text-amber-800">
                      {b.successor.title}
                    </Link>
                  </span>
                ))}
              </>
            ) : (
              " — marcada con riesgo alto"
            )}
            .
          </p>
        )}
        {alert.level === "overdue" && (
          <p className="mt-1 text-sm font-medium text-red-600">
            Final retrasado — hace {alert.businessDaysOverdue} día{alert.businessDaysOverdue !== 1 ? "s" : ""} hábil{alert.businessDaysOverdue !== 1 ? "es" : ""}.
          </p>
        )}
        {alert.level === "lateStart" && (
          <p className="mt-1 text-sm font-medium text-amber-600">
            Debía iniciar hace {alert.businessDaysOverdue} día{alert.businessDaysOverdue !== 1 ? "s" : ""} hábil{alert.businessDaysOverdue !== 1 ? "es" : ""} y sigue sin arrancar.
          </p>
        )}
        {alert.level === "warning" && (
          <p className="mt-1 text-sm font-medium text-amber-600">
            Vence en {alert.daysRemaining} día{alert.daysRemaining !== 1 ? "s" : ""} hábil{alert.daysRemaining !== 1 ? "es" : ""}.
          </p>
        )}
        {alert.level === "onTrack" && (
          <p className="mt-1 text-sm text-emerald-600">
            En curso — vence en {alert.daysRemaining} día{alert.daysRemaining !== 1 ? "s" : ""} hábil{alert.daysRemaining !== 1 ? "es" : ""}.
          </p>
        )}

        <InlineDescription taskId={taskId} description={task.description} canManage={canEdit} />

        <div className="mt-2">
          <InlineMeetingUrl
            taskId={taskId}
            meetingUrl={task.meetingUrl}
            meetingAtLocal={task.meetingAt ? utcToBogotaLocalInputValue(task.meetingAt) : null}
            canManage={canEdit}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <TaskStatusControl key={task.status} taskId={taskId} status={task.status} />
          {canManage && (
            <ModalTrigger label="Compartir" title="Compartir tarea" variant="secondary" compact>
              <ShareLinkPanel
                activeToken={activeShareLink?.token ?? null}
                activeLinkId={activeShareLink?.id ?? null}
                onCreate={createTaskShareLink.bind(null, taskId)}
                onRevoke={revokeTaskShareLink.bind(null, taskId)}
              />
            </ModalTrigger>
          )}
          {canManage && <DeleteTaskButton taskId={taskId} projectId={projectId} title={task.title} />}
        </div>

        {session?.user && (
          <div className="mt-2">
            <GoogleCalendarButton taskId={taskId} userId={session.user.id} />
          </div>
        )}
      </div>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-medium text-slate-900">Checklist de pasos</h2>
        <div className="space-y-2">
          {task.steps.map((s) => (
            <StepCheckbox key={s.id} stepId={s.id} description={s.description} done={s.done} canEdit={canEdit} />
          ))}
          {task.steps.length === 0 && (
            <p className="text-sm text-slate-400">Sin pasos todavía.</p>
          )}
        </div>
        {canEdit && (
          <form action={addStepWithId} className="flex gap-2">
            <input
              name="description"
              placeholder="Nuevo paso / prueba"
              required
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
              Agregar
            </button>
          </form>
        )}
      </section>

      {task.type === "ADJUSTMENT" ? (
        <AdjustmentPanel
          taskId={taskId}
          items={task.adjustmentItems.map((item) => ({
            id: item.id,
            description: item.description,
            note: item.note,
            before: item.attachments.filter((a) => a.kind === "BEFORE").map((a) => ({ id: a.id, url: a.fileUrl, name: a.fileName, mimeType: a.mimeType })),
            after: item.attachments.filter((a) => a.kind === "AFTER").map((a) => ({ id: a.id, url: a.fileUrl, name: a.fileName, mimeType: a.mimeType })),
          }))}
          userId={session?.user?.id ?? null}
          canEdit={canEdit}
          canDelete={canManage}
        />
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-medium text-slate-900">Insumos</h2>
            <AttachmentGrid
              items={insumos.map((a) => ({ id: a.id, url: a.fileUrl, name: a.fileName, mimeType: a.mimeType }))}
              canDelete={canManage}
            />
            {canEdit && session?.user && task.status !== "COMPLETED" && (
              <AttachmentUploader
                taskId={taskId}
                userId={session.user.id}
                kind="INSUMO"
                label="+ Subir insumo"
              />
            )}
            {task.status === "COMPLETED" && (
              <p className="text-xs text-slate-400">La tarea ya está completada — no se pueden subir más insumos.</p>
            )}
          </div>

          <div className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-medium text-slate-900">Resultados / evidencia</h2>
            <AttachmentGrid
              items={resultados.map((a) => ({ id: a.id, url: a.fileUrl, name: a.fileName, mimeType: a.mimeType }))}
              canDelete={canManage}
            />
            {canEdit && session?.user && task.status !== "COMPLETED" && (
              <AttachmentUploader
                taskId={taskId}
                userId={session.user.id}
                kind="RESULTADO"
                label="+ Subir evidencia"
              />
            )}
            {task.status === "COMPLETED" && (
              <p className="text-xs text-slate-400">La tarea ya está completada — no se puede subir más evidencia.</p>
            )}
          </div>
        </section>
      )}

      {task.type === "QA" && (
        <ReviewPanel
          taskId={taskId}
          userId={session?.user?.id ?? null}
          canManage={canManage}
          canEdit={canEdit}
          canReview={canReview}
          users={users.map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatarUrl }))}
          currentReviewerIds={task.reviewers.map((r) => r.userId)}
          templates={testTemplates.map((t) => ({ id: t.id, name: t.name }))}
          rounds={task.reviewRounds.map((round) => ({
            id: round.id,
            roundNumber: round.roundNumber,
            submittedByName: round.submittedBy.name,
            submittedAt: round.submittedAt.toISOString(),
            outcome: round.outcome,
            deliverables: round.deliverables.map((d) => ({ id: d.id, url: d.fileUrl, name: d.fileName, mimeType: d.mimeType })),
            checks: round.checks.map((c) => ({
              id: c.id,
              title: c.title,
              criteria: c.criteria,
              category: c.category,
              result: c.result,
              note: c.note,
              responseCategory: c.responseCategory,
              reviewedByName: c.reviewedBy?.name ?? null,
              evidence: c.evidence.map((e) => ({ id: e.id, url: e.fileUrl, name: e.fileName, mimeType: e.mimeType })),
            })),
            messages: round.messages.map((m) => ({
              id: m.id,
              authorId: m.authorId,
              authorName: m.author.name,
              body: m.body,
              editedAt: m.editedAt?.toISOString() ?? null,
              createdAt: m.createdAt.toISOString(),
            })),
          }))}
        />
      )}

      <section>
        <div className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-medium text-slate-900">Depende de</h2>
          <ul className="space-y-1">
            {task.dependsOn.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/projects/${projectId}/tasks/${d.predecessorId}`} className="min-w-0 truncate hover:underline">
                  {d.predecessor.title}
                </Link>
                {canManage && (
                  <form action={removeDependency.bind(null, d.id, taskId)} className="flex-shrink-0">
                    <button className="text-xs text-slate-400 hover:text-red-600">Quitar</button>
                  </form>
                )}
              </li>
            ))}
            {task.dependsOn.length === 0 && (
              <p className="text-sm text-slate-400">No depende de otras tareas.</p>
            )}
          </ul>
          {canManage && (
            <form action={setDependencyWithId} className="flex gap-2">
              <div className="min-w-0 flex-1">
                <SearchableSelect
                  name="predecessorId"
                  placeholder="Elegir tarea predecesora…"
                  options={otherTasks.map((t) => ({ id: t.id, label: t.title }))}
                />
              </div>
              <button className="flex-shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
                Agregar
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
