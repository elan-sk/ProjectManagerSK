import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveShareToken } from "@/lib/shareLinks";
import { getPublicProjectData, getPublicDefinition, getPublicProjectFiles, getPublicTask } from "@/lib/publicView";
import { PublicHeader } from "../PublicHeader";
import { PublicTaskDetail } from "../PublicTaskDetail";
import { PublicTasksList } from "../PublicTasksList";
import { PublicDefinitionView } from "../PublicDefinitionView";
import { PublicFilesView } from "../PublicFilesView";
import { ConfirmProvider } from "@/components/Confirm";
import { ProjectIcon } from "@/components/ProjectIcon";

const DATE_FMT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" };
// Punto 15 confirmado con el usuario: Gantt y Calendario salen de la vista
// compartida del proyecto — quedan Definición, Tareas y Archivos.
const TABS = [
  { key: "definition", label: "Definición" },
  { key: "tasks", label: "Tareas" },
  { key: "files", label: "Archivos" },
] as const;

export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { token } = await params;
  const { view } = await searchParams;
  const link = await resolveShareToken(token);
  if (!link) notFound();

  if (link.targetType === "TASK") {
    const data = await getPublicTask(link.taskId!);
    if (!data) notFound();
    return (
      // ConfirmProvider: AttachmentLightbox (reusado en PublicFileGrid) llama
      // useConfirm() sin condicionarlo — sin este provider, la página se cae
      // apenas alguien abre una imagen. canDelete siempre va en false acá, así
      // que el diálogo nunca llega a mostrarse, pero el hook igual lo exige.
      <ConfirmProvider>
        <div className="pacific-shell min-h-screen">
          <PublicHeader />
          <main className="mx-auto max-w-2xl p-6">
            <PublicTaskDetail token={token} data={data} />
          </main>
        </div>
      </ConfirmProvider>
    );
  }

  const project = await getPublicProjectData(link.projectId!);
  if (!project) notFound();
  const activeTab = TABS.find((t) => t.key === view)?.key ?? "definition";

  return (
    <ConfirmProvider>
      <div className="pacific-shell min-h-screen">
        <PublicHeader />
        <main className="mx-auto max-w-5xl space-y-4 p-6">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <ProjectIcon name={project.name} iconUrl={project.iconUrl} size="h-12 w-12 flex-shrink-0 text-base" />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-slate-900">{project.name}</h1>
              <p className="truncate text-sm text-slate-500">
                {project.clientName ?? "Proyecto"} · Inicio: {new Date(project.startDate).toLocaleDateString("es-CO", DATE_FMT)}
                {project.targetEndDate && ` · Cierre: ${new Date(project.targetEndDate).toLocaleDateString("es-CO", DATE_FMT)}`}
              </p>
            </div>
          </div>

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

          {activeTab === "definition" && <PublicDefinitionViewLoader projectId={project.id} description={project.description} />}
          {activeTab === "tasks" && <PublicTasksList tasks={project.tasks} phases={project.phases} />}
          {activeTab === "files" && <PublicFilesViewLoader token={token} projectId={project.id} />}
        </main>
      </div>
    </ConfirmProvider>
  );
}

async function PublicDefinitionViewLoader({ projectId, description }: { projectId: string; description: string | null }) {
  const definition = await getPublicDefinition(projectId);
  return <PublicDefinitionView description={description} {...definition} />;
}

async function PublicFilesViewLoader({ token, projectId }: { token: string; projectId: string }) {
  const files = await getPublicProjectFiles(projectId);
  return <PublicFilesView token={token} {...files} />;
}
