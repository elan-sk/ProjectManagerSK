"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DocumentIcon } from "@/components/icons";
import { removeAttachment } from "./actions";

/**
 * Las imágenes se ven primero dentro de la misma app (modal a tamaño
 * completo) — el usuario decide si además quiere descargarlas, en vez de
 * forzar la descarga apenas hace click en la miniatura.
 */
export function AttachmentPreview({
  id,
  url,
  name,
  mimeType,
}: {
  id: string;
  url: string;
  name: string;
  mimeType: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isImage = mimeType.startsWith("image/");

  async function handleDelete() {
    if (!confirm(`¿Eliminar "${name}"? Esta acción no se puede deshacer.`)) return;
    setDeleting(true);
    try {
      await removeAttachment(id);
      router.refresh();
    } finally {
      setDeleting(false);
      setOpen(false);
    }
  }

  if (!isImage) {
    return (
      <div className="group relative min-w-0">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          download={name}
          className="flex h-24 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 p-2 text-center text-xs text-slate-500"
        >
          <DocumentIcon className="h-5 w-5 flex-shrink-0 text-slate-400" />
          <span className="line-clamp-2 w-full break-words">{name}</span>
        </a>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          aria-label="Eliminar archivo"
          className="absolute top-1 right-1 rounded-full bg-white/90 p-1 text-slate-400 opacity-0 shadow-sm hover:text-red-600 group-hover:opacity-100"
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="group relative">
        <button type="button" onClick={() => setOpen(true)} className="block w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={name} className="h-24 w-full rounded-xl border border-slate-200 object-cover" />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          aria-label="Eliminar archivo"
          className="absolute top-1 right-1 rounded-full bg-white/90 p-1 text-slate-400 opacity-0 shadow-sm hover:text-red-600 group-hover:opacity-100"
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-slate-900/60" />
          <div
            className="relative flex max-h-[90vh] max-w-3xl flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={name} className="max-h-[80vh] max-w-full rounded-xl object-contain shadow-[0_8px_30px_rgba(15,23,42,0.3)]" />
            <div className="flex w-full items-center justify-between gap-3 rounded-xl bg-white px-4 py-2">
              <span className="min-w-0 truncate text-sm text-slate-700">{name}</span>
              <div className="flex flex-shrink-0 items-center gap-3">
                <a href={url} download={name} className="text-sm font-medium text-slate-900 hover:underline">
                  Descargar
                </a>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-sm font-medium text-red-600 hover:underline"
                >
                  Eliminar
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-sm text-slate-500 hover:text-slate-900"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14M4 6h16M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
