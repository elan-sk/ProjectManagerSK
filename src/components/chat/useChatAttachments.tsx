"use client";

import { useRef, useState } from "react";
import { uploadWithProgress } from "@/lib/uploadWithProgress";

export type ChatAttachment = { name: string; url: string };

export function useChatAttachments(canAttach: boolean) {
  const [attached, setAttached] = useState<ChatAttachment[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploadError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const { ok, body } = await uploadWithProgress("/api/upload", form);
      if (!ok) throw new Error(body.error ?? "No se pudo subir el archivo.");
      setAttached((prev) => [...prev, { name: body.name, url: body.url }]);
    } catch (err) {
      setUploadError((err as Error).message);
    }
  }

  async function handleFiles(files: File[]) {
    for (const file of files) await handleFile(file);
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
    attached.length > 0 || uploadError ? (
      <div className="flex flex-wrap items-center gap-1 px-1 text-[11px]">
        {attached.map((f) => (
          <span key={f.url} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
            {f.name}
            <button type="button" aria-label={`Quitar ${f.name}`} onClick={() => setAttached((prev) => prev.filter((x) => x.url !== f.url))} className="cursor-pointer text-slate-400 hover:text-slate-900">
              ×
            </button>
          </span>
        ))}
        {uploadError && <span className="text-red-600">{uploadError}</span>}
      </div>
    ) : null;

  const dropOverlay = dragOver ? (
    <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-[#0a6b78] bg-white/90 text-sm font-medium text-[#0a6b78]">
      Soltar aquí para adjuntar
    </div>
  ) : null;

  return { attached, setAttached, openPicker: () => fileInputRef.current?.click(), dropHandlers, fileInput, chips, dropOverlay };
}
