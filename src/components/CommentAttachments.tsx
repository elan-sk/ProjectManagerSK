"use client";

import { useRef, useState } from "react";
import { PaperclipIcon } from "@/components/icons";
import { usePasteImage } from "@/lib/usePasteImage";

export type PendingFile = { url: string; name: string; mimeType: string };

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf";

// Adjuntar imágenes/PDF a un comentario (vista externa e interna): sube cada
// archivo apenas se elige o pega (Ctrl+V) y deja la lista en `files` para que
// quien lo usa la mande junto con el texto. `token` distingue la subida
// pública (/api/upload/public) de la interna (/api/upload, con sesión). Quien
// lo monta marca su caja con data-paste-zone para que el pegado sepa a cuál ir.
export function CommentAttachments({
  files,
  onChange,
  token,
  disabled = false,
}: {
  files: PendingFile[];
  onChange: (files: PendingFile[]) => void;
  token?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  usePasteImage(inputRef);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (token) formData.append("token", token);
      const res = await fetch(token ? "/api/upload/public" : "/api/upload", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "No se pudo subir el archivo.");
        return;
      }
      onChange([...files, body]);
    } catch {
      setError("No se pudo subir el archivo.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-1">
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <li key={f.url} className="group relative">
              {f.mimeType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.url} alt={f.name} className="h-12 w-12 rounded-lg border border-slate-200 object-cover" />
              ) : (
                <span className="flex h-12 w-16 items-center justify-center rounded-lg border border-slate-200 p-1 text-center text-xs text-slate-500">
                  <span className="line-clamp-2 break-all">{f.name}</span>
                </span>
              )}
              <button
                type="button"
                aria-label="Quitar"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="absolute -top-1 -right-1 rounded-full bg-white p-0.5 text-[13px] leading-none text-slate-500 shadow-sm hover:text-red-600"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <label
        className={`inline-flex cursor-pointer items-center gap-1 text-[15px] text-slate-500 hover:text-slate-900 ${disabled ? "pointer-events-none opacity-50" : ""}`}
      >
        <PaperclipIcon className="h-3.5 w-3.5" />
        {uploading ? "Subiendo…" : "Adjuntar imagen (o pegar con Ctrl+V)"}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          disabled={disabled || uploading}
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
      </label>
      {error && <p className="text-[15px] text-red-600">{error}</p>}
    </div>
  );
}
