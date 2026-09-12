import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveShareToken } from "@/lib/shareLinks";
import { getPublicProjectData, getPublicDefinition, getPublicTask } from "@/lib/publicView";
import { PublicHeader } from "../PublicHeader";
import { PublicTaskCard } from "../PublicTaskCard";
import { PublicTasksList } from "../PublicTasksList";
import { PublicGanttView } from "../PublicGanttView";
import { PublicCalendarView } from "../PublicCalendarView";
import { PublicDefinitionView } from "../PublicDefinitionView";

const DATE_FMT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" };
const TABS = [
  { key: "gantt", label: "Gantt" },
  { key: "calendar", label: "Calendario" },
  { key: "definition", label: "Definición" },
  { key: "tasks", label: "Tareas" },
] as const;

export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ view?: string; month?: string }>;
}) {
  const { token } = await params;
  const { view, month } = await searchParams;
  const link = await resolveShareToken(token);
  if (!link) notFound();

  if (link.targetType === "TASK") {
    const data = await getPublicTask(link.taskId!);
    if (!data) notFound();
    return (
      <div className="min-h-screen bg-slate-50">
        <PublicHeader title={data.task.title} subtitle={data.project.name} />
        <main className="mx-auto max-w-2xl p-6">
          <PublicTaskCard task={data.task} />
        </main>
      </div>
    );
  }

  const project = await getPublicProjectData(link.projectId!);
  if (!project) notFound();
  const activeTab = TABS.find((t) => t.key === view)?.key ?? "gantt";

  const [my, mm, md] = month ? month.split("-").map(Number) : [];
  const anchor = month ? new Date(Date.UTC(my, mm - 1, md ?? 1)) : new Date();

  return (
    <div className="min-h-screen bg-slate-50">
      <PublicHeader
        title={project.name}
        subtitle={`${project.clientName ?? "Proyecto"} · Inicio: ${new Date(project.startDate).toLocaleDateString("es-CO", DATE_FMT)}${
          project.targetEndDate ? ` · Cierre: ${new Date(project.targetEndDate).toLocaleDateString("es-CO", DATE_FMT)}` : ""
        }`}
      />
      <main className="mx-auto max-w-5xl space-y-4 p-6">
        <div className="flex flex-wrap gap-2 text-sm">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={`/share/${token}?view=${tab.key}`}
              className={`rounded-lg px-3 py-1.5 ${activeTab === tab.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {activeTab === "gantt" && <PublicGanttView tasks={project.tasks} phases={project.phases} />}
        {activeTab === "calendar" && (
          <PublicCalendarView tasks={project.tasks} anchor={anchor} basePath={`/share/${token}`} />
        )}
        {activeTab === "definition" && <PublicDefinitionViewLoader projectId={project.id} description={project.description} />}
        {activeTab === "tasks" && <PublicTasksList tasks={project.tasks} phases={project.phases} />}
      </main>
    </div>
  );
}

async function PublicDefinitionViewLoader({ projectId, description }: { projectId: string; description: string | null }) {
  const definition = await getPublicDefinition(projectId);
  return <PublicDefinitionView description={description} {...definition} />;
}
