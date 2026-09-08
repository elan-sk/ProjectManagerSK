import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTaskDelayDays, getTaskAlert, getBottlenecks } from "@/lib/delays";
import { businessDaysBetween, todayUTC } from "@/lib/holidays";
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
import { ReassignAssigneesForm } from "./ReassignAssigneesForm";
import { DeleteTaskButton } from "./DeleteTaskButton";
import { ModalTrigger } from "@/components/Modal";

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
    },
  });
  if (!task) notFound();

  const [otherTasks, canManage, users, alert, bottlenecks] = await Promise.all([
    prisma.task.findMany({
      where: { projectId, id: { not: taskId } },
      select: { id: true, title: true },
    }),
    getProjectAdmin(projectId).then(Boolean),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    getTaskAlert(task.project.countryCode, task),
    getBottlenecks(projectId),
  ]);

  const delayDays =
    task.status === "COMPLETED" ? await getTaskDelayDays(task.project.countryCode, task) : 0;
  const bottleneckReason = bottlenecks.find((b) => b.id === taskId)?.bottleneckReason ?? null;
  const daysRemaining =
    alert.level === "warning" || alert.level === "onTrack"
      ? await businessDaysBetween(task.project.countryCode, todayUTC(), task.plannedEnd)
      : 0;

  const insumos = task.attachments.filter((a) => a.kind === "INSUMO");
  const resultados = task.attachments.filter((a) => a.kind === "RESULTADO");

  const addStepWithId = addStep.bind(null, taskId);
  const setDependencyWithId = setDependency.bind(null, taskId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/projects/${projectId}`} className="text-sm text-slate-500 hover:underline">
          ← {task.project.name}
        </Link>
        <div className="mt-1">
          <InlineTitle taskId={taskId} title={task.title} canManage={canManage} />
        </div>
        <InlineDescription taskId={taskId} description={task.description} canManage={canManage} />
        <div className="mt-1 flex flex-wrap items-center gap-1 text-sm text-slate-500">
          <span>
            <InlineType taskId={taskId} type={task.type} canManage={canManage} /> · Fase: {task.phase.name} ·
            Asignados: {task.assignees.map((a) => a.user.name).join(", ") || "Sin asignar"}
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
        {bottleneckReason && (
          <p className="mt-1 text-sm font-medium text-amber-600">Cuello de botella — {bottleneckReason}.</p>
        )}
        {alert.level === "overdue" && (
          <p className="mt-1 text-sm font-medium text-red-600">
            Atrasada {alert.businessDaysOverdue} día(s) hábil(es).
          </p>
        )}
        {alert.level === "warning" && (
          <p className="mt-1 text-sm font-medium text-amber-600">
            Vence pronto — quedan {daysRemaining} día(s) hábil(es).
          </p>
        )}
        {alert.level === "onTrack" && (
          <p className="mt-1 text-sm text-emerald-600">
            En curso — faltan {daysRemaining} día(s) hábil(es) para el fin planeado.
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
              <select name="predecessorId" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">Elegir tarea predecesora…</option>
                {otherTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
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
