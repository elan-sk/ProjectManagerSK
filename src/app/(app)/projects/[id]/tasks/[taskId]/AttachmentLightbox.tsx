"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { removeAttachment } from "./actions";
import { useConfirm } from "@/components/Confirm";

export type LightboxImage = {
  id: string;
  url: string;
  name: string;
  taskLink?: { href: string; title: string };
};

/**
 * Modal de imagen compartido por todo un grupo (Insumos, Evidencia, o el
 * grid de la vista "Archivos") — con más de una imagen se navega con
 * ‹ › o las flechas del teclado sin cerrar la vista previa.
 */
export function AttachmentLightbox({
  images,
  openId,
  onClose,
  onNavigate,
  canDelete,
}: {
  images: LightboxImage[];
  openId: string;
  onClose: () => void;
  onNavigate: (id: string) => void;
  canDelete: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [deleting, setDeleting] = useState(false);
  const index = images.findIndex((i) => i.id === openId);
  const current = images[index];
  const hasMultiple = images.length > 1;

  function goPrev() {
    onNavigate(images[(index - 1 + images.length) % images.length].id);
  }
  function goNext() {
    onNavigate(images[(index + 1) % images.length].id);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasMultiple) goPrev();
      else if (e.key === "ArrowRight" && hasMultiple) goNext();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, images.length]);

  async function handleDelete() {
    if (!current) return;
    const ok = await confirm(`¿Seguro que querés eliminar "${current.name}"? No vas a poder deshacer esto.`, {
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await removeAttachment(current.id);
      router.refresh();
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/60" />
      <div className="relative flex max-h-[90vh] max-w-3xl flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        {hasMultiple && (
          <button
            type="button"
            onClick={goPrev}
            aria-label="Imagen anterior"
            className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-slate-700 shadow-sm hover:bg-white"
          >
            <ChevronIcon className="h-5 w-5" direction="left" />
          </button>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.url} alt={current.name} className="max-h-[80vh] max-w-full rounded-xl object-contain shadow-[0_8px_30px_rgba(15,23,42,0.3)]" />

        {hasMultiple && (
          <button
            type="button"
            onClick={goNext}
            aria-label="Imagen siguiente"
            className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-slate-700 shadow-sm hover:bg-white"
          >
            <ChevronIcon className="h-5 w-5" direction="right" />
          </button>
        )}

        <div className="flex w-full items-center justify-between gap-3 rounded-xl bg-white px-4 py-2">
          <span className="min-w-0 truncate text-sm text-slate-700">
            {current.name}
            {hasMultiple && <span className="text-slate-400"> ({index + 1}/{images.length})</span>}
          </span>
          <div className="flex flex-shrink-0 items-center gap-3">
            <a href={current.url} download={current.name} className="text-sm font-medium text-slate-900 hover:underline">
              Descargar
            </a>
            {current.taskLink && (
              <Link href={current.taskLink.href} className="text-sm font-medium text-slate-900 hover:underline">
                Ver tarea
              </Link>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="text-sm font-medium text-red-600 hover:underline"
              >
                Eliminar
              </button>
            )}
            <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-900">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChevronIcon({ className, direction }: { className?: string; direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d={direction === "left" ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}
