import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTaskDelayDays, getTaskAlert } from "@/lib/delays";
import { getProjectAdmin } from "@/lib/permissions";
import { addStep, setDependency, removeDependency } from "./actions";
import { StepCheckbox } from "./StepCheckbox";
import { AttachmentUploader } from "./AttachmentUploader";
import { AttachmentPreview } from "./AttachmentPreview";
import { GoogleCalendarButton } from "./GoogleCalendarButton";
import { TaskStatusControl } from "./TaskStatusControl";
import { InlineTitle } from "./InlineTitle";
import { InlineDescription } from "./InlineDescription";
import { InlineType } from "./InlineType";
import { InlinePhase } from "./InlinePhase";
import { ReassignAssigneesForm } from "./ReassignAssigneesForm";
import { DeleteTaskButton } from "./DeleteTaskButton";
import { ModalTrigger } from "@/components/Modal";
import { SearchableSelect } from "@/components/SearchableSelect";
import { NavLinkWithMemory } from "../../../../NavLinkWithMemory";

const DATE_FMT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" };

const HAS_CHECKLIST: Record<string, boolean> = { CHECKLIST: true, QA: true };

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
      steps: { orderBy: { order: "asc" } },
      attachments: { include: { uploadedBy: true }, orderBy: { uploadedAt: "desc" } },
      dependsOn: { include: { predecessor: true } },
      blocks: { include: { successor: { select: { id: true, title: true } } } },
    },
  });
  if (!task) notFound();

  const [otherTasks, canManage, users, alert, phases] = await Promise.all([
    prisma.task.findMany({
      where: { projectId, id: { not: taskId } },
      select: { id: true, title: true },
    }),
    getProjectAdmin(projectId).then(Boolean),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    getTaskAlert(task.project.countryCode, task),
    prisma.phase.findMany({ where: { projectId }, orderBy: { order: "asc" } }),
  ]);

  const delayDays =
    task.status === "COMPLETED" ? await getTaskDelayDays(task.project.countryCode, task) : 0;
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
        <div className="mt-1">
          <InlineTitle taskId={taskId} title={task.title} canManage={canManage} />
        </div>
        <InlineDescription taskId={taskId} description={task.description} canManage={canManage} />
        <div className="mt-1 flex flex-wrap items-center gap-1 text-sm text-slate-500">
          <span>
            <InlineType taskId={taskId} type={task.type} canManage={canManage} /> · Fase:{" "}
            <InlinePhase taskId={taskId} phaseId={task.phaseId} phaseName={task.phase.name} phases={phases} canManage={canManage} />{" "}
            · Asignados: {task.assignees.map((a) => a.user.name).join(", ") || "Sin asignar"}
          </span>
          {canManage && (
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
            Atrasada — hace {alert.businessDaysOverdue} día{alert.businessDaysOverdue !== 1 ? "s" : ""} hábil{alert.businessDaysOverdue !== 1 ? "es" : ""}.
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

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <TaskStatusControl taskId={taskId} status={task.status} />
          {canManage && <DeleteTaskButton taskId={taskId} projectId={projectId} title={task.title} />}
        </div>

        {session?.user && (
          <div className="mt-2">
            <GoogleCalendarButton taskId={taskId} userId={session.user.id} />
          </div>
        )}
      </div>

      {HAS_CHECKLIST[task.type] && (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-medium text-slate-900">Checklist de pasos</h2>
          <div className="space-y-2">
            {task.steps.map((s) => (
              <StepCheckbox key={s.id} stepId={s.id} description={s.description} done={s.done} />
            ))}
            {task.steps.length === 0 && (
              <p className="text-sm text-slate-400">Sin pasos todavía.</p>
            )}
          </div>
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
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-medium text-slate-900">Insumos</h2>
          <div className="grid grid-cols-2 gap-2">
            {insumos.map((a) => (
              <AttachmentPreview key={a.id} id={a.id} url={a.fileUrl} name={a.fileName} mimeType={a.mimeType} />
            ))}
          </div>
          {session?.user && (
            <AttachmentUploader
              taskId={taskId}
              userId={session.user.id}
              kind="INSUMO"
              label="+ Subir insumo"
            />
          )}
        </div>

        <div className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-medium text-slate-900">Resultados / evidencia</h2>
          <div className="grid grid-cols-2 gap-2">
            {resultados.map((a) => (
              <AttachmentPreview key={a.id} id={a.id} url={a.fileUrl} name={a.fileName} mimeType={a.mimeType} />
            ))}
          </div>
          {session?.user && (
            <AttachmentUploader
              taskId={taskId}
              userId={session.user.id}
              kind="RESULTADO"
              label="+ Subir evidencia"
            />
          )}
        </div>
      </section>

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
