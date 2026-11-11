"use client";

import { useRef, useState } from "react";
import { uploadWithProgress } from "@/lib/uploadWithProgress";
import { PaperclipIcon } from "@/components/icons";

export type ChatAttachment = { name: string; url: string; preview?: string };
type Upload = { key: string; name: string; preview?: string; progress: number };

// Miniatura local (sin esperar al servidor) para que se vea qué se está subiendo.
// ponytail: las URL locales de imágenes enviadas no se liberan hasta recargar; son pocas y pequeñas.
const localPreview = (file: File) => (file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined);

export function useChatAttachments(canAttach: boolean) {
  const [attached, setAttached] = useState<ChatAttachment[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // Lo que se está subiendo, visible en el recuadro: la barra inferior de la app queda tapada por el asistente a pantalla completa.
  const [uploads, setUploads] = useState<Upload[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploadError(null);
    const form = new FormData();
    form.append("file", file);
    const key = `${Date.now()}-${Math.random()}`;
    const preview = localPreview(file);
    const setProgress = (progress: number) => setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, progress } : u)));
    setUploads((prev) => [...prev, { key, name: file.name, preview, progress: 0 }]);
    try {
      const { ok, body } = await uploadWithProgress("/api/upload", form, setProgress);
      if (!ok) throw new Error(body.error ?? "No se pudo subir el archivo.");
      setAttached((prev) => [...prev, { name: body.name, url: body.url, preview }]);
    } catch (err) {
      if (preview) URL.revokeObjectURL(preview);
      setUploadError(`«${file.name}»: ${(err as Error).message}`);
    } finally {
      setUploads((prev) => prev.filter((u) => u.key !== key));
    }
  }

  async function handleFiles(files: File[]) {
    await Promise.all(files.map(handleFile));
  }

  function remove(f: ChatAttachment) {
    if (f.preview) URL.revokeObjectURL(f.preview);
    setAttached((prev) => prev.filter((x) => x.url !== f.url));
  }

  const hasFiles = (types: readonly string[]) => types.includes("Files");

  const dropHandlers = {
    onDragOver(e: React.DragEvent) {
      if (!canAttach || !hasFiles(e.dataTransfer.types)) return;
      e.preventDefault();
      setDragOver(true);
    },
    onDragLeave(e: React.DragEvent) {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
    },
    onDrop(e: React.DragEvent) {
      if (!hasFiles(e.dataTransfer.types)) return;
      e.preventDefault();
      setDragOver(false);
      if (canAttach) void handleFiles(Array.from(e.dataTransfer.files));
    },
    onPaste(e: React.ClipboardEvent) {
      const files = Array.from(e.clipboardData.files);
      if (!canAttach || files.length === 0) return;
      e.preventDefault();
      void handleFiles(files);
    },
  };

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      multiple
      hidden
      onChange={(e) => {
        void handleFiles(Array.from(e.target.files ?? []));
        e.target.value = "";
      }}
    />
  );

  const chips =
    attached.length > 0 || uploads.length > 0 || uploadError ? (
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-2">
          {attached.map((f) => (
            <FileTile key={f.url} name={f.name} preview={f.preview}>
              <button type="button" aria-label={`Quitar ${f.name}`} title="Quitar" onClick={() => remove(f)} className="absolute top-1 right-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-slate-900/70 text-xs text-white hover:bg-slate-900">
                ×
              </button>
            </FileTile>
          ))}
          {uploads.map((u) => (
            <FileTile key={u.key} name={u.name} preview={u.preview}>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-900/55 text-white" aria-live="polite">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                <span className="text-[11px] font-semibold">{Math.round(u.progress * 100)} %</span>
              </div>
              <div className="absolute inset-x-0 bottom-0 h-1 bg-white/30">
                <div className="h-full bg-white transition-[width]" style={{ width: `${Math.round(u.progress * 100)}%` }} />
              </div>
            </FileTile>
          ))}
        </div>
        {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
      </div>
    ) : null;

  const dropOverlay = dragOver ? (
    <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-[#0a6b78] bg-white/90 text-sm font-medium text-[#0a6b78]">
      Soltar aquí para adjuntar
    </div>
  ) : null;

  return { attached, setAttached, uploading: uploads.length > 0, openPicker: () => fileInputRef.current?.click(), dropHandlers, fileInput, chips, dropOverlay };
}

function FileTile({ name, preview, children }: { name: string; preview?: string; children: React.ReactNode }) {
  const ext = name.includes(".") ? name.split(".").pop()!.toUpperCase().slice(0, 5) : "";
  return (
    <div className="w-20" title={name}>
      <div className="relative h-20 w-20 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-500">
            <PaperclipIcon className="h-6 w-6" />
            {ext && <span className="text-[10px] font-semibold">{ext}</span>}
          </div>
        )}
        {children}
      </div>
      <p className="mt-1 truncate text-[11px] text-slate-600">{name}</p>
    </div>
  );
}
