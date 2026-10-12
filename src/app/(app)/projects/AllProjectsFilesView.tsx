import { ComboFilter } from "@/components/ComboFilter";
import { ResetFiltersButton } from "@/components/ResetFiltersButton";
import { SearchBox } from "@/components/SearchBox";
import { TabMenu } from "@/components/TabMenu";
import { FILTER_BAR } from "@/lib/filterLayout";
import { AttachmentSections } from "./[id]/tasks/[taskId]/AttachmentSections";
import type { SharedLinkItem } from "@/components/SharedLinkTiles";
import type { PlaceLink } from "./[id]/tasks/[taskId]/AttachmentPreview";

const FILE_TYPE_LABEL: Record<string, string> = {
  all: "Todos",
  image: "Imágenes",
  document: "Documentos",
  link: "Links",
  credential: "Contraseñas",
};

// Igual que ProjectFilesView (misma pestaña Insumos/Evidencia, mismo filtro
// de tipo y buscador) pero abarcando TODOS los proyectos a la vez — el
// filtro por tarea se reemplaza por uno de proyecto (elegir una tarea
// puntual entre potencialmente cientos no tiene el mismo sentido acá), y
// cada tarjeta muestra a qué proyecto pertenece. Los archivos ya vienen
// filtrados por el caller según a qué proyectos tiene acceso el usuario
// (mismo criterio que el resto del "Panorama general").
export function AllProjectsFilesView({
  files,
  projects,
  sharedLinks,
  fileKind,
  fileType,
  fileProject,
  fileQ,
  filesHref,
}: {
  files: { id: string; projectId: string; projectName: string; taskId: string | null; taskTitle: string | null; fileUrl: string; fileName: string; mimeType: string; section?: string; subtitle?: string; project?: PlaceLink["project"] }[];
  projects: { id: string; label: string }[];
  // Ver mismo comentario en ProjectFilesView.
  sharedLinks: SharedLinkItem[];
  fileKind?: "INSUMO" | "RESULTADO";
  fileType?: string;
  fileProject?: string;
  fileQ?: string;
  filesHref: (overrides: Record<string, string | undefined>) => string;
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
      </div>

      <div className={`${FILTER_BAR} mb-3 text-sm`}>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Buscar</span>
          <SearchBox
            basePath="/projects"
            q={fileQ}
            paramName="fileQ"
            placeholder="Buscar por nombre…"
            hiddenParams={{ view: "files", fileKind, fileType, fileProject }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Proyecto</span>
          <ComboFilter
            allLabel="Todos los proyectos"
            value={fileProject}
            options={projects}
            paramKey="fileProject"
            basePath="/projects"
            currentParams={{ view: "files", fileKind, fileType, fileQ }}
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
          count={[fileProject, fileQ, fileKind, fileType && fileType !== "all"].filter(Boolean).length}
          href={filesHref({ fileKind: undefined, fileType: undefined, fileProject: undefined, fileQ: undefined })}
        />
      </div>

      {files.length === 0 && (!showSharedLinks || sharedLinks.length === 0) ? (
        <p className="text-sm text-slate-400">Sin archivos.</p>
      ) : (
        <AttachmentSections
          sharedLinks={showSharedLinks ? sharedLinks : []}
          className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6"
          canDelete={false}
          items={files.map((f) => ({
            id: f.id,
            url: f.fileUrl,
            name: f.fileName,
            mimeType: f.mimeType,
            taskLink: f.taskId
              ? { href: `/projects/${f.projectId}/tasks/${f.taskId}`, title: `${f.projectName} — ${f.taskTitle}${f.section ? ` · ${f.section}` : ""}`, project: f.project }
              : { href: `/projects/${f.projectId}`, title: `${f.projectName} (insumo del proyecto)`, project: f.project },
            subtitle: f.subtitle,
          }))}
        />
      )}
    </div>
  );
}
