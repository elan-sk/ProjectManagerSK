"use client";

import { ModalTrigger, useModalClose } from "@/components/Modal";
import { UploadZoneLabel } from "@/components/UploadZoneLabel";
import { usePasteImage } from "@/lib/usePasteImage";
import { uploadWithProgress } from "@/lib/uploadWithProgress";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { addProjectAttachment, addProjectLink } from "./definitionActions";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.html";

// Botón de la pestaña Archivos: abre un popup para subir archivos o links
// directo al proyecto (ProjectAttachment/ProjectLink), que ya cuentan como
// Insumos en esta vista.
export function ProjectInsumoUploader({ projectId }: { projectId: string }) {
  return (
    <ModalTrigger label="+ Agregar insumo" title="Agregar insumo al proyecto" className="ml-auto rounded-lg bg-slate-900 px-3 py-1.5 text-white hover:bg-slate-800">
      <UploadForm projectId={projectId} />
    </ModalTrigger>
  );
}

function UploadForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const close = useModalClose();
  const inputRef = useRef<HTMLInputElement>(null);
  usePasteImage(inputRef);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  async function uploadFiles(files: File[]) {
    setUploading(true);
    setError(null);
    setProgress(0);
    const failed: string[] = [];
    for (const [i, file] of files.entries()) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const { ok, body } = await uploadWithProgress("/api/upload", formData, (f) => setProgress((i + f) / files.length));
        if (!ok) {
          failed.push(`${file.name}: ${body.error ?? "no se pudo subir"}`);
          continue;
        }
        const result = await addProjectAttachment(projectId, { url: body.url, name: body.name, mimeType: body.mimeType });
        if (!result.ok) failed.push(`${file.name}: ${result.error ?? "no se pudo guardar"}`);
      } catch (err) {
        failed.push(`${file.name}: ${(err as Error).message || "no se pudo subir"}`);
      }
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
    if (failed.length > 0) setError(failed.join(" · "));
    else close();
  }

  function addLink() {
    if (!url.trim()) return;
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("title", title);
      formData.set("url", url);
      const result = await addProjectLink(projectId, formData);
      if (result.ok) {
        router.refresh();
        close();
      } else setError(result.error ?? "No se pudo agregar el link.");
    });
  }

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const files = Array.from(e.dataTransfer.files ?? []);
          if (files.length > 0) uploadFiles(files);
        }}
        className={`flex cursor-pointer items-center justify-center rounded-lg border border-dashed p-6 text-sm text-slate-500 ${
          dragOver ? "border-slate-500 bg-slate-50" : "border-slate-300 hover:border-slate-400"
        }`}
      >
        <UploadZoneLabel uploading={uploading} dragOver={dragOver} label="Subir archivos (o pegar una imagen con Ctrl+V)" progress={progress} />
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={() => {
            const files = Array.from(inputRef.current?.files ?? []);
            if (files.length > 0) uploadFiles(files);
          }}
        />
      </label>
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />o agregar un link<span className="h-px flex-1 bg-slate-200" />
      </div>
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addLink()}
          placeholder="https://…"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nombre (opcional)"
          className="w-40 flex-shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        />
        <button
          type="button"
          disabled={isPending || !url.trim()}
          onClick={addLink}
          className="flex-shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Agregar
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
