"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postInternalMessage } from "@/app/(app)/internalMessageActions";
import { COMMENT_MAX_LENGTH, imageMarker, splitCommentBody } from "@/lib/commentBody";
import { pastedImageName, pickPastedImage } from "@/lib/pasteImage";

/**
 * Caja para escribir un comentario interno. Además de texto acepta capturas
 * pegadas (Ctrl+V): se suben a /uploads y se inserta en el texto una marca con
 * su ruta (ver commentBody.ts); debajo se ven como miniaturas quitables.
 * Con el foco en la caja se resalta el borde, para saber que ahí es donde va
 * a caer la captura.
 */
export function CommentForm({ projectId, taskId }: { projectId: string; taskId: string | null }) {
  const router = useRouter();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [pending, startTransition] = useTransition();

  const images = splitCommentBody(value).flatMap((p) => (p.type === "image" ? [p.url] : []));

  async function addImage(file: File) {
    const el = areaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? start;
    setUploading((n) => n + 1);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", new File([file], pastedImageName(file.type), { type: file.type }));
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "No se pudo subir la imagen.");
      setValue((v) => v.slice(0, start) + imageMarker(body.url) + v.slice(end));
    } catch (err) {
      setError((err as Error).message || "No se pudo subir la imagen.");
    } finally {
      setUploading((n) => n - 1);
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const image = pickPastedImage(Array.from(e.clipboardData.files));
    // Si el portapapeles trae texto (ej. celdas de Excel), gana el pegado normal.
    if (!image || e.clipboardData.getData("text/plain").trim() !== "") return;
    // preventDefault también le avisa a usePasteImage (áreas de subida) que ya se atendió.
    e.preventDefault();
    void addImage(image);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await postInternalMessage(projectId, taskId, value);
      if (result.ok) {
        setValue("");
        router.refresh();
      } else {
        setError(result.error ?? "No se pudo enviar el comentario.");
      }
    });
  }

  const busy = pending || uploading > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && value.trim()) submit();
      }}
      className="space-y-1.5"
    >
      <div className="flex gap-2">
        <div className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white transition focus-within:border-[#0a6b78] focus-within:ring-2 focus-within:ring-[#0a6b78]/40">
          <textarea
            ref={areaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onPaste={onPaste}
            maxLength={COMMENT_MAX_LENGTH}
            placeholder="Escribir comentario interno…"
            aria-label="Comentario interno"
            className="block min-h-10 w-full resize-y rounded-lg bg-transparent px-3 py-2 text-sm outline-none"
          />
        </div>
        <button
          disabled={busy || !value.trim()}
          className="self-end rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Enviando…" : "Enviar"}
        </button>
      </div>

      {uploading > 0 && <p className="text-xs text-slate-400">Subiendo imagen…</p>}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((url) => (
            <figure key={url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="Captura adjunta" className="h-16 w-auto max-w-40 rounded-lg border border-slate-200 object-cover" />
              <button
                type="button"
                onClick={() => setValue((v) => v.replace(imageMarker(url), ""))}
                aria-label="Quitar captura"
                className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-xs text-white"
              >
                ×
              </button>
            </figure>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
