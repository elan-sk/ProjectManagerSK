"use client";

import { usePasteImage } from "@/lib/usePasteImage";
import { UploadZoneLabel } from "@/components/UploadZoneLabel";
import { useRef, useState } from "react";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv";

// Widget de subida compartido entre el "Archivos" del proyecto y los
// insumos de una tarea en la vista compartida por link (puntos 15/16) —
// misma UI de arrastrar/soltar + link que AttachmentUploader, pero llamando
// a las acciones públicas (sin sesión) en vez de las internas.
export function PublicUploadWidget({
  onUploadFile,
  onAddLink,
  label,
}: {
  onUploadFile: (file: File) => Promise<string | void>;
  onAddLink: (url: string, name: string) => Promise<string | void>;
  label: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  usePasteImage(inputRef);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingLink, setAddingLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const err = await onUploadFile(file);
      if (err) setError(err);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleLink() {
    if (!linkUrl.trim() || !linkName.trim()) return;
    setUploading(true);
    setError(null);
    try {
      const err = await onAddLink(linkUrl.trim(), linkName.trim());
      if (err) setError(err);
      else {
        setLinkUrl("");
        setLinkName("");
        setAddingLink(false);
      }
    } finally {
      setUploading(false);
    }
  }

  if (addingLink) {
    return (
      <div className="flex flex-col gap-2">
        <input
          autoFocus
          value={linkName}
          onChange={(e) => setLinkName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLink()}
          placeholder="Nombre (lo que se va a ver)"
          className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-xs"
        />
        <div className="flex gap-2">
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLink()}
            placeholder="https://…"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs"
          />
          <button
            type="button"
            disabled={uploading || !linkUrl.trim() || !linkName.trim()}
            onClick={handleLink}
            className="flex-shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => setAddingLink(false)}
            className="flex-shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-500 hover:border-slate-400"
          >
            Cancelar
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          className={`flex flex-1 cursor-pointer items-center justify-center rounded-lg border border-dashed p-3 text-xs text-slate-500 ${
            dragOver ? "border-slate-500 bg-slate-50" : "border-slate-300 hover:border-slate-400"
          }`}
        >
          <UploadZoneLabel uploading={uploading} dragOver={dragOver} label={label} />
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>
        <button
          type="button"
          onClick={() => setAddingLink(true)}
          className="flex-shrink-0 rounded-lg border border-dashed border-slate-300 px-3 text-xs text-slate-500 hover:border-slate-400"
        >
          + Link
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
