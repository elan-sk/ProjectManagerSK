import { ComboFilter } from "@/components/ComboFilter";
import { ResetFiltersButton } from "@/components/ResetFiltersButton";
import { SearchBox } from "@/components/SearchBox";
import Link from "next/link";
import { AttachmentSections } from "./tasks/[taskId]/AttachmentSections";
import { ProjectInsumoUploader } from "./ProjectInsumoUploader";
import { AddCredentialButton } from "../../credentials/AddCredentialButton";

const FILE_TYPE_LABEL: Record<string, string> = {
  all: "Todos",
  image: "Imágenes",
  document: "Documentos",
  link: "Links",
  credential: "Contraseñas",
};

function tabClass(active: boolean) {
  return `flex-shrink-0 rounded-lg px-3 py-1.5 ${active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`;
}

function pillClass(active: boolean) {
  return `flex-shrink-0 rounded-lg px-2.5 py-1 text-xs ${active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`;
}

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
}: {
  projectId: string;
  // section: dónde se usa dentro de la tarea (Insumos, Ajuste · Antes, Ronda 1 · Entregable…); readOnly: se quita desde su tarea.
  files: { id: string; taskId: string | null; taskTitle: string | null; fileUrl: string; fileName: string; mimeType: string; section?: string; readOnly?: boolean; subtitle?: string }[];
  tasks: { id: string; title: string }[];
  // Links de "Compartir" (acceso público al proyecto/tarea) activos —
  // distintos de un adjunto tipo link (recurso externo pegado a mano),
  // por eso van en su propia sección en vez de la grilla de AttachmentGrid.
  sharedLinks: { id: string; label: string; token: string; href: string }[];
  fileKind?: "INSUMO" | "RESULTADO";
  fileType?: string;
  fileTask?: string;
  fileQ?: string;
  canDelete: boolean;
  filesHref: (overrides: Record<string, string | undefined>) => string;
}) {
  const showSharedLinks = !fileType || fileType === "all" || fileType === "link";
  return (
    <div className="space-y-4">
      {/* Mobile (< lg): una sola fila con scroll horizontal en vez de envolver en más líneas. */}
      <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1 text-sm lg:overflow-visible lg:pb-0">
        <Link href={filesHref({ fileKind: undefined })} className={tabClass(!fileKind)}>
          Todos
        </Link>
        <Link href={filesHref({ fileKind: "INSUMO" })} className={tabClass(fileKind === "INSUMO")}>
          Insumos
        </Link>
        <Link href={filesHref({ fileKind: "RESULTADO" })} className={tabClass(fileKind === "RESULTADO")}>
          Evidencia
        </Link>
        {canDelete && (
          <div className="ml-auto flex flex-shrink-0 gap-2">
            <AddCredentialButton place={{ projectId }} className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-slate-700 hover:bg-slate-200" />
            <ProjectInsumoUploader projectId={projectId} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-x-5 gap-y-3 text-sm mb-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Buscar</span>
          <SearchBox
            basePath={`/projects/${projectId}`}
            q={fileQ}
            paramName="fileQ"
            placeholder="Buscar por nombre…"
            hiddenParams={{ view: "files", fileKind, fileType, fileTask }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Tarea</span>
          <ComboFilter
            allLabel="Todas las tareas"
            value={fileTask}
            options={tasks.map((t) => ({ id: t.id, label: t.title }))}
            paramKey="fileTask"
            basePath={`/projects/${projectId}`}
            currentParams={{ view: "files", fileKind, fileType, fileQ }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Tipo</span>
          <div className="flex flex-nowrap gap-1.5 overflow-x-auto pb-1 lg:overflow-visible lg:pb-0">
            {(["all", "image", "document", "link", "credential"] as const).map((t) => (
              <Link key={t} href={filesHref({ fileType: t === "all" ? undefined : t })} className={pillClass((fileType ?? "all") === t)}>
                {FILE_TYPE_LABEL[t]}
              </Link>
            ))}
          </div>
        </div>

        <ResetFiltersButton
          count={[fileTask, fileQ, fileKind, fileType && fileType !== "all"].filter(Boolean).length}
          href={filesHref({ fileKind: undefined, fileType: undefined, fileTask: undefined, fileQ: undefined })}
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
              ? { href: `/projects/${projectId}/tasks/${f.taskId}`, title: f.section ? `${f.taskTitle} · ${f.section}` : f.taskTitle! }
              : { href: `/projects/${projectId}?view=definition`, title: "Definición del proyecto" },
            canDelete: f.readOnly ? false : undefined,
            subtitle: f.subtitle,
          }))}
        />
      )}
    </div>
  );
}
