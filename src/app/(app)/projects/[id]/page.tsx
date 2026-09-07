import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { businessDaysRange } from "@/lib/holidays";
import { addPhase, addTask } from "./actions";
import { KanbanBoard, type TaskCard } from "./KanbanBoard";
import { GanttView, type GanttTask } from "./GanttView";

const TASK_TYPES = [
  { value: "SIMPLE", label: "Simple" },
  { value: "CHECKLIST", label: "Checklist" },
  { value: "MILESTONE", label: "Hito" },
  { value: "MEETING", label: "Reunión / entrega" },
  { value: "QA", label: "Prueba de calidad" },
  { value: "ADJUSTMENT", label: "Ajuste" },
];

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const { view } = await searchParams;

  const [project, users] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        pm: true,
        phases: { orderBy: { order: "asc" } },
        tasks: { include: { assignees: { include: { user: true } }, steps: true } },
      },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!project) notFound();

  const taskCards: TaskCard[] = project.tasks.map((t) => ({
    id: t.id,
    title: t.title,
    type: t.type,
    status: t.status,
    riskLevel: t.riskLevel,
    assignees: t.assignees.map((a) => a.user.name),
    stepsProgress:
      t.steps.length > 0
        ? { done: t.steps.filter((s) => s.done).length, total: t.steps.length }
        : null,
  }));

  const addPhaseWithId = addPhase.bind(null, project.id);
  const addTaskWithId = addTask.bind(null, project.id);

  const rangeEnd =
    project.tasks.length > 0
      ? new Date(Math.max(...project.tasks.map((t) => t.plannedEnd.getTime())))
      : project.startDate;
  const businessDays = await businessDaysRange(project.countryCode, project.startDate, rangeEnd);

  const dateKey = (d: Date) => d.toISOString().slice(0, 10);
  const businessDayIndex = new Map(businessDays.map((d, i) => [dateKey(d), i]));

  const ganttTasks: GanttTask[] = project.tasks.map((t) => {
    const startIndex = businessDayIndex.get(dateKey(t.plannedStart)) ?? 0;
    const endIndex = businessDayIndex.get(dateKey(t.plannedEnd)) ?? startIndex;
    return {
      id: t.id,
      title: t.title,
      phaseName: project.phases.find((p) => p.id === t.phaseId)?.name ?? "—",
      status: t.status,
      startIndex,
      span: endIndex - startIndex + 1,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{project.name}</h1>
        <p className="text-sm text-slate-500">
          {project.clientName ?? "Interno"} · PM: {project.pm.name} · Festivos: {project.countryCode}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <form action={addPhaseWithId} className="flex items-end gap-2 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex-1 space-y-1">
            <label className="text-sm text-slate-600">Nueva fase</label>
            <input name="name" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <button className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Agregar
          </button>
        </form>

        <form action={addTaskWithId} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              name="title"
              placeholder="Título de la tarea"
              required
              className="col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <select name="phaseId" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {project.phases.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select name="type" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {TASK_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <input type="date" name="plannedStart" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input
              type="number"
              name="durationDays"
              min={1}
              defaultValue={1}
              placeholder="Días hábiles"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              name="assigneeIds"
              multiple
              required
              className="col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <button className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Crear tarea
          </button>
        </form>
      </div>

      <div className="flex gap-2 text-sm">
        <Link
          href={`/projects/${project.id}`}
          className={`rounded-lg px-3 py-1.5 ${!view || view === "kanban" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
        >
          Tablero
        </Link>
        <Link
          href={`/projects/${project.id}?view=gantt`}
          className={`rounded-lg px-3 py-1.5 ${view === "gantt" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
        >
          Gantt
        </Link>
      </div>

      {view === "gantt" ? (
        <GanttView projectId={project.id} businessDays={businessDays} tasks={ganttTasks} />
      ) : (
        <KanbanBoard
          key={taskCards.map((t) => `${t.id}:${t.status}`).join(",")}
          initialTasks={taskCards}
          projectId={project.id}
        />
      )}
    </div>
  );
}
