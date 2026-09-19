import { ComboFilter } from "@/components/ComboFilter";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { LinkIcon } from "@/components/icons";
import { ResetFiltersButton } from "@/components/ResetFiltersButton";
import { SearchBox } from "@/components/SearchBox";
import Link from "next/link";
import { AttachmentGrid } from "./[id]/tasks/[taskId]/AttachmentGrid";

const FILE_TYPE_LABEL: Record<string, string> = {
  all: "Todos",
  image: "Imágenes",
  document: "Documentos",
  link: "Links",
};

function tabClass(active: boolean) {
  return `rounded-lg px-3 py-1.5 ${active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`;
}

function pillClass(active: boolean) {
  return `rounded-lg px-2.5 py-1 text-xs ${active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`;
}

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
  files: { id: string; projectId: string; projectName: string; taskId: string | null; taskTitle: string | null; fileUrl: string; fileName: string; mimeType: string }[];
  projects: { id: string; label: string }[];
  // Ver mismo comentario en ProjectFilesView.
  sharedLinks: { id: string; label: string; token: string; href: string }[];
  fileKind?: "INSUMO" | "RESULTADO";
  fileType?: string;
  fileProject?: string;
  fileQ?: string;
  filesHref: (overrides: Record<string, string | undefined>) => string;
}) {
  const showSharedLinks = !fileType || fileType === "all" || fileType === "link";
  return (
    <div className="space-y-4">
      <div className="flex gap-2 text-sm">
        <Link href={filesHref({ fileKind: undefined })} className={tabClass(!fileKind)}>
          Todos
        </Link>
        <Link href={filesHref({ fileKind: "INSUMO" })} className={tabClass(fileKind === "INSUMO")}>
          Insumos
        </Link>
        <Link href={filesHref({ fileKind: "RESULTADO" })} className={tabClass(fileKind === "RESULTADO")}>
          Evidencia
        </Link>
      </div>

      <div className="flex flex-wrap items-start gap-x-5 gap-y-3 text-sm mb-3">
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
          <div className="flex gap-1.5">
            {(["all", "image", "document", "link"] as const).map((t) => (
              <Link key={t} href={filesHref({ fileType: t === "all" ? undefined : t })} className={pillClass((fileType ?? "all") === t)}>
                {FILE_TYPE_LABEL[t]}
              </Link>
            ))}
          </div>
        </div>

        <ResetFiltersButton
          count={[fileProject, fileQ, fileKind, fileType && fileType !== "all"].filter(Boolean).length}
          href={filesHref({ fileKind: undefined, fileType: undefined, fileProject: undefined, fileQ: undefined })}
        />
      </div>

      {showSharedLinks && sharedLinks.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-400">Links compartidos</p>
          <div className="space-y-1.5">
            {sharedLinks.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm mb-1">
                <Link href={l.href} className="flex min-w-0 items-center gap-1.5 truncate text-slate-700 hover:underline">
                  <LinkIcon className="h-3.5 w-3.5 flex-shrink-0 text-indigo-500" />
                  <span className="truncate">{l.label}</span>
                </Link>
                <CopyLinkButton token={l.token} className="flex-shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50" />
              </div>
            ))}
          </div>
        </div>
      )}

      {files.length === 0 ? (
        (!showSharedLinks || sharedLinks.length === 0) && <p className="text-sm text-slate-400">Sin archivos.</p>
      ) : (
        <AttachmentGrid
          className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6"
          canDelete={false}
          items={files.map((f) => ({
            id: f.id,
            url: f.fileUrl,
            name: f.fileName,
            mimeType: f.mimeType,
            taskLink: f.taskId
              ? { href: `/projects/${f.projectId}/tasks/${f.taskId}`, title: `${f.projectName} — ${f.taskTitle}` }
              : { href: `/projects/${f.projectId}`, title: `${f.projectName} (insumo del proyecto)` },
          }))}
        />
      )}
    </div>
  );
}
