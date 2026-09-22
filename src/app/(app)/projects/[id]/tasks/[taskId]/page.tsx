import Link from "next/link";
import { canSeeProject } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTaskDelayDays, getTaskEarlyDays, getTaskAlert, getTaskScheduleVariance } from "@/lib/delays";
import { utcToBogotaLocalInputValue } from "@/lib/workingHours";
import { getProjectAdmin, canEditTask, canReviewTask } from "@/lib/permissions";
import { addStep, setDependency, removeDependency } from "./actions";
import { NewStepInput } from "./NewStepInput";
import { StepList } from "./StepList";
import { AttachmentUploader } from "./AttachmentUploader";
import { AttachmentGrid } from "./AttachmentGrid";
import { AdjustmentPanel } from "./AdjustmentPanel";
import { TeamShareThread } from "./TeamShareThread";
import type { RoundMessage } from "./RoundThread";
import { CheckThreadsProvider, type CheckMessage } from "./CheckThread";
import { threadInclude, toTeamPoll, toThread, type PollRow } from "@/lib/threadView";
import { ReviewPanel } from "./ReviewPanel";
import { AcceptancePanel } from "./AcceptancePanel";
import { GoogleCalendarButton } from "./GoogleCalendarButton";
import { TaskStatusControl } from "./TaskStatusControl";
import { InlineTitle } from "./InlineTitle";
import { InlineDescription } from "./InlineDescription";
import { InlineMeetingUrl } from "./InlineMeetingUrl";
import { InlineType } from "./InlineType";
import { InlinePhase } from "./InlinePhase";
import { ReassignAssigneesForm } from "./ReassignAssigneesForm";
import { UrgentIcon } from "@/components/icons";
import { TaskOpsButtons } from "./TaskOpsButtons";
import { DeleteTaskButton } from "./DeleteTaskButton";
import { ModalTrigger } from "@/components/Modal";
import { ShareIcon } from "@/components/icons";
import { SearchableSelect } from "@/components/SearchableSelect";
import { AvatarGroup } from "@/components/Avatar";
import { ProjectIcon } from "@/components/ProjectIcon";
import { NavLinkWithMemory } from "../../../../NavLinkWithMemory";
import { getActiveShareLink } from "@/lib/shareLinks";
import { createTaskShareLink, revokeTaskShareLink } from "../../../../shareActions";
import { ShareLinkPanel } from "@/components/ShareLinkPanel";
import { TaskTagsEditor } from "./TaskTagsEditor";
import { InternalConversation } from "@/components/InternalConversation";

const DATE_FMT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" };

type RoundMessageRow = {
  id: string;
  authorId: string;
  author: { name: string };
  body: string;
  editedAt: Date | null;
  createdAt: Date;
  attachments: { id: string; fileUrl: string; fileName: string; mimeType: string }[];
  poll: PollRow | null;
};

// Mensaje del hilo interno de una ronda (Prueba / Aceptación) -> DTO serializable.
const toRoundMessage = (m: RoundMessageRow, userId: string | null): RoundMessage => ({
  id: m.id,
  authorId: m.authorId,
  authorName: m.author.name,
  body: m.body,
  editedAt: m.editedAt?.toISOString() ?? null,
  createdAt: m.createdAt.toISOString(),
  attachments: m.attachments.map((a) => ({ id: a.id, url: a.fileUrl, name: a.fileName, mimeType: a.mimeType })),
  poll: m.poll ? toTeamPoll(m.poll, userId) : null,
});


export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>;
}) {
  const { id: projectId, taskId } = await params;
  const session = await auth();

  // Punto 18: abrir la tarea relacionada cuenta como "atendida" — antes las
  // notificaciones solo se limpiaban a mano (botón "Descartar"/"Marcar todas
  // como leídas"), nunca por el simple hecho de entrar a ver de qué se trataban.
  if (session?.user) {
    await prisma.notification.updateMany({
      where: { userId: session.user.id, taskId, read: false },
      data: { read: true },
    });
    // Resumen de agenda/WhatsApp: cuenta como "abierta" apenas el asignado
    // entra al detalle, sin importar si hace algo más ahí adentro.
    await prisma.taskAssignee.updateMany({
      where: { taskId, userId: session.user.id, viewedAt: null },
      data: { viewedAt: new Date() },
    });
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: true,
      phase: true,
      assignees: { include: { user: true } },
      reviewers: { include: { user: true } },
      steps: { orderBy: { order: "asc" }, include: { attachments: { orderBy: { uploadedAt: "asc" } }, poll: threadInclude.poll } },
      attachments: { include: { uploadedBy: true }, orderBy: { uploadedAt: "desc" } },
      adjustmentItems: {
        include: {
          attachments: true,
          shareComments: { where: { parentId: null }, include: threadInclude, orderBy: { createdAt: "asc" } },
        },
        orderBy: { order: "asc" },
      },
      shareComments: { where: { adjustmentItemId: null, reviewCheckId: null, parentId: null }, include: threadInclude, orderBy: { createdAt: "asc" } },
      reviewRounds: {
        orderBy: { roundNumber: "desc" },
        include: {
          submittedBy: true,
          deliverables: true,
          checks: {
            include: {
              evidence: true,
              reviewedBy: true,
              shareComments: { where: { parentId: null }, include: threadInclude, orderBy: { createdAt: "asc" } },
            },
            orderBy: { order: "asc" },
          },
          messages: { include: { author: true, attachments: true, poll: threadInclude.poll }, orderBy: { createdAt: "asc" } },
        },
      },
      dependsOn: { include: { predecessor: true } },
      blocks: { include: { successor: { select: { id: true, title: true } } } },
      taskTags: { include: { tag: { include: { category: true } } } },
    },
  });
  if (!task) notFound();

  // Tarea tipo Prueba: hilo interno de cada prueba (comentarios, menciones, imágenes, preguntas).
  const checkMessageRows =
    task.type === "QA"
      ? await prisma.internalMessage.findMany({
          where: { taskId, reviewCheckId: { not: null } },
          include: { author: { select: { name: true, avatarUrl: true } }, poll: threadInclude.poll },
          orderBy: { createdAt: "asc" },
        })
      : [];
  const checkThreads: Record<string, CheckMessage[]> = {};
  for (const m of checkMessageRows) {
    (checkThreads[m.reviewCheckId!] ??= []).push({
      id: m.id,
      authorId: m.authorId,
      authorName: m.author.name,
      authorAvatarUrl: m.author.avatarUrl,
      createdLabel: m.createdAt.toLocaleString("es-CO"),
      createdAtMs: m.createdAt.getTime(),
      body: m.body,
      edited: Boolean(m.editedAt),
      poll: m.poll ? toTeamPoll(m.poll, session?.user?.id ?? null) : null,
    });
  }
  // Un proyecto oculto solo lo ve el administrador que es su responsable (PM).
  if (!session?.user || !canSeeProject(task.project, session.user)) notFound();

  const [otherTasks, canManage, canEdit, canReview, users, alert, phases, activeShareLink, testTemplates, responseCategories, tagCategories, projectTags] = await Promise.all([
    prisma.task.findMany({
      where: { projectId, id: { not: taskId } },
      select: { id: true, title: true },
    }),
    getProjectAdmin(projectId).then(Boolean),
    canEditTask(taskId),
    canReviewTask(taskId),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    getTaskAlert(task.project.countryCode, task),
    prisma.phase.findMany({ where: { projectId }, orderBy: { order: "asc" } }),
    getActiveShareLink("TASK", taskId),
    task.type === "QA" ? prisma.testTemplate.findMany({ orderBy: { createdAt: "asc" } }) : Promise.resolve([]),
    task.type === "QA"
      ? prisma.responseCategory.findMany({ include: { responses: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    prisma.tagCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.tag.findMany({ where: { projectId }, select: { id: true, categoryId: true, name: true } }),
  ]);

  // Mismo mapa que en projects/[id]/page.tsx: nombres ya usados en este
  // proyecto por categoría, para sugerir (sin obligar) en el <datalist>.
  const projectTagNamesByCategory: Record<string, string[]> = {};
  for (const t of projectTags) {
    (projectTagNamesByCategory[t.categoryId] ??= []).push(t.name);
  }

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

  const stepsTotal = task.steps.length;
  const stepsDone = task.steps.filter((st) => st.done).length;
  const stepsPct = stepsTotal > 0 ? Math.round((stepsDone / stepsTotal) * 100) : 0;

  const insumos = task.attachments.filter((a) => a.kind === "INSUMO");
  // Los Insumos que salieron de un paso del checklist llevan una nota con el nombre del paso.
  const stepTitleById = new Map(task.steps.map((st) => [st.id, st.description.replace(/\*([^*\n]+)\*/g, "$1")]));
  const insumoItems = insumos.map((a) => ({
    id: a.id,
    url: a.fileUrl,
    name: a.fileName,
    mimeType: a.mimeType,
    caption: a.stepId && stepTitleById.has(a.stepId) ? `del paso: ${stepTitleById.get(a.stepId)}` : undefined,
  }));
  const resultados = task.attachments.filter((a) => a.kind === "RESULTADO");

  // Punto 5: mismas reglas de "¿puede completarse ya?" que updateTaskStatus
  // valida del lado servidor (actions.ts) — se resuelven acá (con los datos
  // que la página ya trae) para que TaskStatusControl pueda deshabilitar el
  // botón "Completada" desde el primer render, no después de un clic
  // rechazado.
  let completionBlockedReason: string | null = null;
  if (task.steps.some((s) => !s.done)) {
    completionBlockedReason = "Todavía hay pasos del checklist sin completar.";
  } else if (task.type === "MILESTONE" && !task.attachments.some((a) => a.kind === "RESULTADO")) {
    completionBlockedReason = "Este entregable necesita al menos una evidencia cargada para poder completarse.";
  } else if (task.type === "ADJUSTMENT") {
    const pendingCount = task.adjustmentItems.filter(
      (item) => !item.note && !item.attachments.some((a) => a.kind === "AFTER")
    ).length;
    if (pendingCount > 0) {
      completionBlockedReason = `Todavía hay ${pendingCount} cambio(s) sin responder (falta el "Después" o una nota).`;
    }
  } else if (task.type === "QA") {
    const lastReviewRound = task.reviewRounds[0];
    if (!lastReviewRound || lastReviewRound.outcome !== "APPROVED") {
      completionBlockedReason = "Esta revisión necesita una ronda aprobada antes de poder completarse.";
    }
  } else if (task.type === "ACCEPTANCE") {
    const lastRound = task.reviewRounds[0];
    if (!lastRound || lastRound.outcome !== "APPROVED") {
      completionBlockedReason = "Esta entrega necesita una ronda aceptada por el cliente antes de poder completarse.";
    }
  }

  const addStepWithId = addStep.bind(null, taskId);
  const setDependencyWithId = setDependency.bind(null, taskId);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <NavLinkWithMemory
          href={`/projects/${projectId}`}
          storageKey={`project:${projectId}`}
          className="text-sm text-slate-500 hover:underline"
        >
          ← {task.project.name}
        </NavLinkWithMemory>
        <div className="mt-1 flex items-center gap-2">
          <ProjectIcon name={task.project.name} iconUrl={task.project.iconUrl} size="h-10 w-10 flex-shrink-0 text-sm" projectId={projectId} />
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

        <div className="mt-1.5">
          <TaskTagsEditor
            taskId={taskId}
            currentTags={task.taskTags.map((tt) => ({
              taskTagId: tt.id,
              categoryId: tt.categoryId,
              categoryName: tt.tag.category.name,
              colorHex: tt.tag.category.colorHex,
              emoji: tt.tag.category.emoji,
              name: tt.tag.name,
            }))}
            categories={tagCategories}
            projectTagNamesByCategory={projectTagNamesByCategory}
            canEdit={canEdit}
          />
        </div>

        {stepsTotal > 0 && (
          <div className="mt-2 max-w-sm">
            <StepsProgress pct={stepsPct} label={`Checklist: ${stepsDone}/${stepsTotal} pasos · ${stepsPct}%`} />
          </div>
        )}
        {task.isUrgent && task.status !== "COMPLETED" && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white" title={canManage ? undefined : "Solo un administrador o el PM puede quitar la urgencia"}>
            <UrgentIcon className="h-3.5 w-3.5" />
            Tarea urgente
          </p>
        )}
        {task.archivedAt && (
          <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
            Archivada el {task.archivedAt.toLocaleDateString("es-CO", DATE_FMT)}
          </p>
        )}
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
            {alert.businessDaysOverdue > 0
              ? `Final retrasado — hace ${alert.businessDaysOverdue} día${alert.businessDaysOverdue !== 1 ? "s" : ""} hábil${alert.businessDaysOverdue !== 1 ? "es" : ""}.`
              : "Final retrasado — la fecha límite ya pasó."}
          </p>
        )}
        {alert.level === "lateStart" && (
          <p className="mt-1 text-sm font-medium text-amber-600">
            {alert.businessDaysOverdue > 0
              ? `Debía iniciar hace ${alert.businessDaysOverdue} día${alert.businessDaysOverdue !== 1 ? "s" : ""} hábil${alert.businessDaysOverdue !== 1 ? "es" : ""} y sigue sin arrancar.`
              : "Debía iniciar y sigue sin arrancar."}
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

        <div className="mt-2">
          <InlineMeetingUrl
            taskId={taskId}
            meetingUrl={task.meetingUrl}
            meetingAtLocal={task.meetingAt ? utcToBogotaLocalInputValue(task.meetingAt) : null}
            canManage={canEdit}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <TaskStatusControl
            key={task.status}
            taskId={taskId}
            status={task.status}
            type={task.type}
            canEdit={canEdit}
            canReview={canReview}
            canManage={canManage}
            completionBlockedReason={completionBlockedReason}
          />
          {canEdit && (
            <ModalTrigger label="Compartir" title="Compartir tarea" variant="secondary" compact icon={<ShareIcon className="h-3.5 w-3.5" />}>
              <ShareLinkPanel
                activeToken={activeShareLink?.token ?? null}
                activeLinkId={activeShareLink?.id ?? null}
                onCreate={createTaskShareLink.bind(null, taskId)}
                onRevoke={revokeTaskShareLink.bind(null, taskId)}
              />
            </ModalTrigger>
          )}
        </div>

        {/* Urgente, Duplicar y Eliminar: siempre juntos en UNA sola línea. */}
        {canManage && (
          <div className="mt-2 flex flex-nowrap items-center gap-2 overflow-x-auto">
            <TaskOpsButtons taskId={taskId} projectId={projectId} isUrgent={task.isUrgent} completed={task.status === "COMPLETED"} archived={task.archivedAt !== null} />
            <DeleteTaskButton taskId={taskId} projectId={projectId} title={task.title} pill />
          </div>
        )}

        {session?.user && (
          <div className="mt-2">
            <GoogleCalendarButton taskId={taskId} userId={session.user.id} />
          </div>
        )}
      </div>

      {(task.description || canEdit) && (
        <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-[21px] font-semibold text-slate-900">Descripción</h2>
          <InlineDescription taskId={taskId} description={task.description} canManage={canEdit} />
        </section>
      )}

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[21px] font-semibold text-slate-900">Checklist de pasos</h2>
          {stepsTotal > 0 && (
            <span className="text-xs font-medium text-slate-500">
              {stepsDone}/{stepsTotal} · {stepsPct}%
            </span>
          )}
        </div>
        {stepsTotal > 0 && <StepsProgress pct={stepsPct} />}
        <StepList
          taskId={taskId}
          steps={task.steps.map((st) => ({
            id: st.id,
            description: st.description,
            done: st.done,
            attachments: st.attachments.map((a) => ({ id: a.id, url: a.fileUrl, name: a.fileName, mimeType: a.mimeType })),
            poll: st.poll ? toTeamPoll(st.poll, session?.user?.id ?? null) : null,
          }))}
          canEdit={canEdit}
          canAddFiles={task.status !== "COMPLETED"}
        />
        {canEdit && (
          <form action={addStepWithId} className="flex gap-2">
            <NewStepInput />
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
            insumos: item.attachments.filter((a) => a.kind === "INSUMO").map((a) => ({ id: a.id, url: a.fileUrl, name: a.fileName, mimeType: a.mimeType })),
            clientApproval: item.clientApproval,
            clientApprovalBy: item.clientApprovalBy,
            clientReviewOpen: item.clientReviewOpen,
            comments: item.shareComments.map((c) => toThread(c, session?.user?.id ?? null)),
          }))}
          canAttach={task.status !== "COMPLETED"}
          canVote={canEdit || canReview}
          userId={session?.user?.id ?? null}
          canEdit={canEdit}
          canDelete={canManage}
        />
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-[21px] font-semibold text-slate-900">Insumos</h2>
            <AttachmentGrid
              items={insumoItems}
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
            <h2 className="text-[21px] font-semibold text-slate-900">Evidencias</h2>
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

      {/* Tarea tipo Ajuste: las imágenes que suben cliente/equipo en los comentarios quedan como Insumos. */}
      {task.type === "ADJUSTMENT" && (insumos.length > 0 || (canEdit && task.status !== "COMPLETED")) && (
        <section className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-[21px] font-semibold text-slate-900">Insumos</h2>
          <AttachmentGrid
            items={insumoItems}
            canDelete={canManage}
          />
          {canEdit && session?.user && task.status !== "COMPLETED" && (
            <AttachmentUploader taskId={taskId} userId={session.user.id} kind="INSUMO" label="+ Subir insumo" />
          )}
        </section>
      )}

      {/* Hilo general del link compartido (en Ajuste cada cambio lleva su propio hilo, dentro del panel). */}
      {task.type !== "ADJUSTMENT" && (task.shareComments.length > 0 || (canEdit && activeShareLink)) && (
        <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-[21px] font-semibold text-slate-900">Comentarios del link compartido</h2>
          <TeamShareThread taskId={taskId} comments={task.shareComments.map((c) => toThread(c, session?.user?.id ?? null))} canReply={canEdit} canVote={canEdit || canReview} canAttach={task.status !== "COMPLETED"} />
        </section>
      )}

      {task.type === "QA" && session?.user && (
        <CheckThreadsProvider
          projectId={projectId}
          taskId={taskId}
          currentUserId={session.user.id}
          people={users.filter((u) => u.id !== session.user.id).map((u) => ({ id: u.id, name: u.name }))}
          threads={checkThreads}
          canVote={canEdit || canReview}
          canClose={canEdit}
          canModerate={Boolean(canManage)}
        >
          <ReviewPanel
            taskId={taskId}
            userId={session?.user?.id ?? null}
            canManage={
              // Punto 11: además de PM/admin, puede cambiar el revisor el
              // propio revisor actual (para pasarle la posta a otro), o el
              // asignado cuando todavía no hay ninguno (autoasignación única
              // — reviewActions.ts vuelve a validar esto igual del lado server).
              canManage ||
              task.reviewers.some((r) => r.userId === session?.user?.id) ||
              (task.reviewers.length === 0 && canEdit)
            }
            canEdit={canEdit}
            canReview={canReview}
            taskStatus={task.status}
            users={users.map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatarUrl }))}
            currentReviewerIds={task.reviewers.map((r) => r.userId)}
            templates={testTemplates.map((t) => ({ id: t.id, name: t.name }))}
            responseCategories={responseCategories.map((c) => ({ name: c.name, responses: c.responses.map((r) => r.text) }))}
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
              messages: round.messages.map((m) => toRoundMessage(m, session?.user?.id ?? null)),
            }))}
          />
        </CheckThreadsProvider>
      )}

      {task.type === "ACCEPTANCE" && (
        <AcceptancePanel
          taskId={taskId}
          userId={session?.user?.id ?? null}
          canEdit={canEdit}
          canVote={canEdit || canReview}
          taskStatus={task.status}
          rounds={task.reviewRounds.map((round) => ({
            id: round.id,
            roundNumber: round.roundNumber,
            submittedByName: round.submittedBy.name,
            submittedAt: round.submittedAt.toISOString(),
            outcome: round.outcome,
            deliverables: round.deliverables.map((d) => ({ id: d.id, url: d.fileUrl, name: d.fileName, mimeType: d.mimeType })),
            items: round.checks.map((c) => ({
              id: c.id,
              title: c.title,
              criteria: c.criteria,
              category: c.category,
              result: c.result as "APPROVED" | "FAILED" | null,
              note: c.note,
              reviewedByExternalName: c.externalReviewerName,
              reviewedByExternalRole: c.externalReviewerRole,
              evidence: c.evidence.map((e) => ({ id: e.id, url: e.fileUrl, name: e.fileName, mimeType: e.mimeType })),
              comments: c.shareComments.map((cm) => toThread(cm, session?.user?.id ?? null)),
            })),
            messages: round.messages.map((m) => toRoundMessage(m, session?.user?.id ?? null)),
          }))}
        />
      )}

      <InternalConversation projectId={projectId} taskId={taskId} title="Conversación de la tarea" />

      <section>
        <div className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-[21px] font-semibold text-slate-900">Depende de</h2>
          <ul className="space-y-1">
            {task.dependsOn.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/projects/${projectId}/tasks/${d.predecessorId}`} className="min-w-0 truncate hover:underline">
                  {d.predecessor.title}
                </Link>
                {canManage && (
                  <form
                    action={async () => {
                      "use server";
                      await removeDependency(d.id, taskId);
                    }}
                    className="flex-shrink-0"
                  >
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

// Barra de avance del checklist (verde al completarse).
function StepsProgress({ pct, label }: { pct: number; label?: string }) {
  return (
    <div className="space-y-1">
      {label && <p className="text-xs text-slate-500">{label}</p>}
      <div className="h-2 w-full overflow-hidden rounded-xs bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-fill-emerald h-full rounded-xs" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
