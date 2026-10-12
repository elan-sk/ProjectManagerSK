import { ComboFilter } from "@/components/ComboFilter";
import { ResetFiltersButton } from "@/components/ResetFiltersButton";
import { SearchBox } from "@/components/SearchBox";
import { TabMenu } from "@/components/TabMenu";
import { FILTER_BAR } from "@/lib/filterLayout";
import { AttachmentSections } from "./tasks/[taskId]/AttachmentSections";
import { ProjectInsumoUploader } from "./ProjectInsumoUploader";
import type { SharedLinkItem } from "@/components/SharedLinkTiles";
import type { PlaceLink } from "./tasks/[taskId]/AttachmentPreview";

const FILE_TYPE_LABEL: Record<string, string> = {
  all: "Todos",
  image: "Imágenes",
  document: "Documentos",
  link: "Links",
  credential: "Contraseñas",
};

export function ProjectFilesView({
  projectId,
  files,
  tasks,
  sharedLinks,
  fileKind,
  fileType,
  fileTask,
  fileQ,
  canDelete,
  filesHref,
  projectOptions,
  fileProject,
}: {
  projectId: string;
  // section: dónde se usa dentro de la tarea (Insumos, Ajuste · Antes, Ronda 1 · Entregable…); readOnly: se quita desde su tarea.
  // projectId/project (spec 004): en un proyecto principal, cada archivo dice de qué proyecto del grupo es.
  files: { id: string; taskId: string | null; taskTitle: string | null; fileUrl: string; fileName: string; mimeType: string; section?: string; readOnly?: boolean; subtitle?: string; projectId?: string; project?: PlaceLink["project"] }[];
  tasks: { id: string; title: string }[];
  // Links de "Compartir" (acceso público al proyecto/tarea) activos —
  // distintos de un adjunto tipo link (recurso externo pegado a mano),
  // por eso van en su propia sección en vez de la grilla de AttachmentGrid.
  sharedLinks: SharedLinkItem[];
  fileKind?: "INSUMO" | "RESULTADO";
  fileType?: string;
  fileTask?: string;
  fileQ?: string;
  canDelete: boolean;
  filesHref: (overrides: Record<string, string | undefined>) => string;
  /** Solo en proyectos principales (spec 004): filtro «Proyecto» (el principal y cada subproyecto). */
  projectOptions?: { id: string; label: string }[];
  fileProject?: string;
}) {
  const showSharedLinks = !fileType || fileType === "all" || fileType === "link";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <TabMenu
          items={[
            { label: "Todos", href: filesHref({ fileKind: undefined }), active: !fileKind },
            { label: "Insumos", href: filesHref({ fileKind: "INSUMO" }), active: fileKind === "INSUMO" },
            { label: "Resultados", href: filesHref({ fileKind: "RESULTADO" }), active: fileKind === "RESULTADO" },
          ]}
        />
        {canDelete && (
          <div className="ml-auto flex flex-shrink-0 gap-2">
            <ProjectInsumoUploader projectId={projectId} />
          </div>
        )}
      </div>

      <div className={`${FILTER_BAR} mb-3 text-sm`}>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Buscar</span>
          <SearchBox
            basePath={`/projects/${projectId}`}
            q={fileQ}
            paramName="fileQ"
            placeholder="Buscar por nombre…"
            hiddenParams={{ view: "files", fileKind, fileType, fileTask, fileProject }}
          />
        </div>

        {projectOptions && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Proyecto</span>
            <ComboFilter
              allLabel="Todos los proyectos"
              value={fileProject}
              options={projectOptions}
              paramKey="fileProject"
              basePath={`/projects/${projectId}`}
              currentParams={{ view: "files", fileKind, fileType, fileTask, fileQ }}
            />
          </div>
        )}

        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Tarea</span>
          <ComboFilter
            allLabel="Todas las tareas"
            value={fileTask}
            options={tasks.map((t) => ({ id: t.id, label: t.title }))}
            paramKey="fileTask"
            basePath={`/projects/${projectId}`}
            currentParams={{ view: "files", fileKind, fileType, fileQ, fileProject }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Tipo</span>
          <TabMenu
            variant="pill"
            items={(["all", "image", "document", "link", "credential"] as const).map((t) => ({
              label: FILE_TYPE_LABEL[t],
              href: filesHref({ fileType: t === "all" ? undefined : t }),
              active: (fileType ?? "all") === t,
            }))}
          />
        </div>

        <ResetFiltersButton
          count={[fileTask, fileQ, fileKind, fileProject, fileType && fileType !== "all"].filter(Boolean).length}
          href={filesHref({ fileKind: undefined, fileType: undefined, fileTask: undefined, fileQ: undefined, fileProject: undefined })}
        />
      </div>

      {files.length === 0 && (!showSharedLinks || sharedLinks.length === 0) ? (
        <p className="text-sm text-slate-400">Sin archivos.</p>
      ) : (
        <AttachmentSections
          sharedLinks={showSharedLinks ? sharedLinks : []}
          className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6"
          canDelete={canDelete}
          items={files.map((f) => ({
            id: f.id,
            url: f.fileUrl,
            name: f.fileName,
            mimeType: f.mimeType,
            taskLink: f.taskId
              ? { href: `/projects/${f.projectId ?? projectId}/tasks/${f.taskId}`, title: f.section ? `${f.taskTitle} · ${f.section}` : f.taskTitle!, project: f.project }
              : { href: `/projects/${f.projectId ?? projectId}?view=definition`, title: "Definición del proyecto", project: f.project },
            canDelete: f.readOnly ? false : undefined,
            subtitle: f.subtitle,
          }))}
        />
      )}
    </div>
  );
}
