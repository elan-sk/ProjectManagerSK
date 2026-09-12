import Link from "next/link";
import { AttachmentGrid } from "./tasks/[taskId]/AttachmentGrid";
import { ComboFilter } from "@/components/ComboFilter";
import { SearchBox } from "@/components/SearchBox";

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

export function ProjectFilesView({
  projectId,
  files,
  tasks,
  fileKind,
  fileType,
  fileTask,
  fileQ,
  canDelete,
  filesHref,
}: {
  projectId: string;
  files: { id: string; taskId: string | null; taskTitle: string | null; fileUrl: string; fileName: string; mimeType: string }[];
  tasks: { id: string; title: string }[];
  fileKind: "INSUMO" | "RESULTADO";
  fileType?: string;
  fileTask?: string;
  fileQ?: string;
  canDelete: boolean;
  filesHref: (overrides: Record<string, string | undefined>) => string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex gap-2 text-sm">
        <Link href={filesHref({ fileKind: undefined })} className={tabClass(fileKind !== "RESULTADO")}>
          Insumos
        </Link>
        <Link href={filesHref({ fileKind: "RESULTADO" })} className={tabClass(fileKind === "RESULTADO")}>
          Evidencia
        </Link>
      </div>

      <div className="flex flex-wrap items-start gap-x-5 gap-y-3 text-sm">
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
          <div className="flex gap-1.5">
            {(["all", "image", "document", "link"] as const).map((t) => (
              <Link key={t} href={filesHref({ fileType: t === "all" ? undefined : t })} className={pillClass((fileType ?? "all") === t)}>
                {FILE_TYPE_LABEL[t]}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {files.length === 0 ? (
        <p className="text-sm text-slate-400">Sin archivos.</p>
      ) : (
        <AttachmentGrid
          className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6"
          canDelete={canDelete}
          items={files.map((f) => ({
            id: f.id,
            url: f.fileUrl,
            name: f.fileName,
            mimeType: f.mimeType,
            taskLink: f.taskId ? { href: `/projects/${projectId}/tasks/${f.taskId}`, title: f.taskTitle! } : undefined,
          }))}
        />
      )}
    </div>
  );
}
