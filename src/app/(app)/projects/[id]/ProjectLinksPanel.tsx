"use client";

import { usePasteImage } from "@/lib/usePasteImage";
import { UploadZoneLabel } from "@/components/UploadZoneLabel";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addProjectLink, addProjectAttachment } from "./definitionActions";
import { AttachmentGrid } from "./tasks/[taskId]/AttachmentGrid";
import { LINK_MIME_TYPE } from "@/lib/attachments";

type ProjectLink = { id: string; title: string; url: string };
type ProjectAttachment = { id: string; fileName: string; fileUrl: string; mimeType: string };

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv";

export function ProjectLinksPanel({
  projectId,
  links,
  attachments,
  canManage,
}: {
  projectId: string;
  links: ProjectLink[];
  attachments: ProjectAttachment[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  usePasteImage(inputRef);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function handleAdd() {
    if (!title.trim() || !url.trim()) return;
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("title", title);
      formData.set("url", url);
      const result = await addProjectLink(projectId, formData);
      if (result.ok) {
        setTitle("");
        setUrl("");
        router.refresh();
      } else {
        setError(result.error ?? "No se pudo agregar el link.");
      }
    });
  }

  async function uploadFiles(files: File[]) {
    setUploading(true);
    setUploadError(null);
    const failed: string[] = [];
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const body = await res.json();
        if (!res.ok) {
          failed.push(`${file.name}: ${body.error ?? "no se pudo subir"}`);
          continue;
        }
        const result = await addProjectAttachment(projectId, { url: body.url, name: body.name, mimeType: body.mimeType });
        if (!result.ok) failed.push(`${file.name}: ${result.error ?? "no se pudo guardar"}`);
      } catch (err) {
        failed.push(`${file.name}: ${(err as Error).message || "no se pudo subir"}`);
      }
    }
    if (failed.length > 0) setUploadError(failed.join(" · "));
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  function handleFileChange() {
    const files = Array.from(inputRef.current?.files ?? []);
    if (files.length > 0) uploadFiles(files);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) uploadFiles(files);
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-medium text-slate-900">Archivos y enlaces</h2>
      {/* Misma grilla con miniaturas que la pestaña Archivos: imágenes, documentos y enlaces (YouTube en visor). */}
      {links.length === 0 && attachments.length === 0 ? (
        <p className="text-sm text-slate-400">Sin archivos ni enlaces todavía.</p>
      ) : (
        <AttachmentGrid
          className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6"
          canDelete={canManage}
          items={[
            ...attachments.map((a) => ({ id: a.id, url: a.fileUrl, name: a.fileName, mimeType: a.mimeType })),
            ...links.map((l) => ({ id: l.id, url: l.url, name: l.title, mimeType: LINK_MIME_TYPE })),
          ]}
        />
      )}
      {canManage && (
        <div className="space-y-2 border-t border-slate-100 pt-2">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`flex cursor-pointer items-center justify-center rounded-lg border border-dashed p-3 text-xs text-slate-500 ${
              dragOver ? "border-slate-500 bg-slate-50" : "border-slate-300 hover:border-slate-400"
            }`}
          >
            <UploadZoneLabel uploading={uploading} dragOver={dragOver} label="Subir un archivo" />
            <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={handleFileChange} />
          </label>
          {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="https://…"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nombre"
              className="w-40 flex-shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            />
            <button
              type="button"
              disabled={isPending || !title.trim() || !url.trim()}
              onClick={handleAdd}
              className="flex-shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Agregar
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
