import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTaskDelayDays } from "@/lib/delays";
import { addStep, setDependency, removeDependency } from "./actions";
import { StepCheckbox } from "./StepCheckbox";
import { AttachmentUploader } from "./AttachmentUploader";
import { GoogleCalendarButton } from "./GoogleCalendarButton";
import { DocumentIcon } from "@/components/icons";

const HAS_CHECKLIST: Record<string, boolean> = { CHECKLIST: true, QA: true };

function isImage(mimeType: string) {
  return mimeType.startsWith("image/");
}

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
      blocks: { include: { successor: true } },
    },
  });
  if (!task) notFound();

  const otherTasks = await prisma.task.findMany({
    where: { projectId, id: { not: taskId } },
    select: { id: true, title: true },
  });

  const delayDays =
    task.status === "COMPLETED" ? await getTaskDelayDays(task.project.countryCode, task) : 0;

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
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{task.title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {task.type} · Fase: {task.phase.name} · Asignados:{" "}
          {task.assignees.map((a) => a.user.name).join(", ") || "Sin asignar"}
        </p>
        {delayDays > 0 && (
          <p className="mt-1 text-sm font-medium text-red-600">
            Generó {delayDays} día(s) hábil(es) de atraso propio.
          </p>
        )}
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
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-medium text-slate-900">Insumos</h2>
          <div className="grid grid-cols-2 gap-2">
            {insumos.map((a) => (
              <AttachmentPreview key={a.id} url={a.fileUrl} name={a.fileName} mimeType={a.mimeType} />
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

        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-medium text-slate-900">Resultados / evidencia</h2>
          <div className="grid grid-cols-2 gap-2">
            {resultados.map((a) => (
              <AttachmentPreview key={a.id} url={a.fileUrl} name={a.fileName} mimeType={a.mimeType} />
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

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-medium text-slate-900">Depende de</h2>
        <ul className="space-y-1">
          {task.dependsOn.map((d) => (
            <li key={d.id} className="flex items-center justify-between text-sm">
              <Link href={`/projects/${projectId}/tasks/${d.predecessorId}`} className="hover:underline">
                {d.predecessor.title}
              </Link>
              <form action={removeDependency.bind(null, d.id, taskId)}>
                <button className="text-xs text-slate-400 hover:text-red-600">Quitar</button>
              </form>
            </li>
          ))}
          {task.dependsOn.length === 0 && (
            <p className="text-sm text-slate-400">No depende de otras tareas.</p>
          )}
        </ul>
        <form action={setDependencyWithId} className="flex gap-2">
          <select name="predecessorId" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Elegir tarea predecesora…</option>
            {otherTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <button className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Agregar
          </button>
        </form>
      </section>
    </div>
  );
}

function AttachmentPreview({
  url,
  name,
  mimeType,
}: {
  url: string;
  name: string;
  mimeType: string;
}) {
  if (isImage(mimeType)) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block" download={name}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={name} className="h-24 w-full rounded-xl border border-slate-200 object-cover" />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      download={name}
      className="flex h-24 flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 p-2 text-center text-xs text-slate-500"
    >
      <DocumentIcon className="h-5 w-5 text-slate-400" />
      <span className="line-clamp-2">{name}</span>
    </a>
  );
}
