"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DocumentIcon, LinkIcon } from "@/components/icons";
import { removeAttachment } from "./actions";
import { LINK_MIME_TYPE, linkHostname, youtubeVideoId } from "@/lib/attachments";
import { useConfirm } from "@/components/Confirm";

/**
 * Solo la miniatura — un documento/link abre en pestaña nueva, una imagen
 * avisa al padre (onOpenImage) que la abra en el lightbox compartido del
 * grupo (AttachmentGrid), que es quien sabe navegar entre las demás
 * imágenes sin cerrar la vista previa.
 */
export function AttachmentPreview({
  id,
  url,
  name,
  mimeType,
  canDelete,
  taskLink,
  onOpenImage,
  onOpenPreview,
  onOpenVideo,
  wide,
}: {
  id: string;
  url: string;
  name: string;
  mimeType: string;
  canDelete: boolean;
  /** Solo en la vista "Archivos" del proyecto, que junta adjuntos de varias tareas — lleva de vuelta a la tarea dueña. */
  taskLink?: { href: string; title: string };
  onOpenImage?: () => void;
  /** PDF/Word/Excel — abre el visor (AttachmentPreviewModal) en vez de descargar directo. */
  onOpenPreview?: () => void;
  /** Link de YouTube — abre el reproductor integrado en vez de salir a otra pestaña. */
  onOpenVideo?: () => void;
  /** Vista «Archivos»: todas las fichas ocupan el mismo ancho (2 columnas de la grilla), igual que los links. */
  wide?: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [deleting, setDeleting] = useState(false);
  const isImage = mimeType.startsWith("image/");
  const isLink = mimeType === LINK_MIME_TYPE;

  async function handleDelete() {
    const ok = await confirm(`¿Seguro que querés eliminar "${name}"? No vas a poder deshacer esto.`, {
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await removeAttachment(id);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  const videoId = isLink ? youtubeVideoId(url) : null;

  if (isLink) {
    // Tarjeta de link: dominio visible y, para YouTube, miniatura con play.
    const linkClass =
      "flex h-24 w-full min-w-0 items-stretch overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition-colors hover:border-[#0a6b78]/50 hover:bg-slate-50";
    const content = videoId ? (
      <>
        <span className="relative w-28 flex-shrink-0 bg-slate-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`} alt="" className="h-full w-full object-cover opacity-90" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow">
              <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 h-4 w-4"><path d="M8 5v14l11-7z" /></svg>
            </span>
          </span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3">
          <span className="line-clamp-2 break-words text-xs font-medium text-slate-800">{name}</span>
          <span className="text-[11px] text-slate-400">YouTube · ver aquí</span>
        </span>
      </>
    ) : (
      <>
        <span className="flex w-12 flex-shrink-0 items-center justify-center bg-[#0a6b78]/10 text-[#0a6b78]">
          <LinkIcon className="h-5 w-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3">
          <span className="line-clamp-2 break-words text-xs font-medium text-slate-800">{name}</span>
          <span className="truncate text-[11px] text-slate-400">{linkHostname(url)} ↗</span>
        </span>
      </>
    );
    return (
      <div className="group relative col-span-2 min-w-0">
        {videoId && onOpenVideo ? (
          <button type="button" onClick={onOpenVideo} className={linkClass}>
            {content}
          </button>
        ) : (
          <a href={url} target="_blank" rel="noreferrer" className={linkClass}>
            {content}
          </a>
        )}
        {taskLink && (
          <Link
            href={taskLink.href}
            className="mt-0.5 block truncate text-center text-[11px] text-slate-400 hover:text-slate-700 hover:underline"
          >
            → {taskLink.title}
          </Link>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            aria-label="Eliminar link"
            className="absolute top-1 right-1 rounded-full bg-white/90 p-1 text-slate-400 opacity-0 shadow-sm hover:text-red-600 group-hover:opacity-100"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  if (!isImage) {
    const thumbClass = "flex h-24 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 p-2 text-center text-xs text-slate-500";
    const thumbContent = (
      <>
        {isLink ? (
          <LinkIcon className="h-5 w-5 flex-shrink-0 text-slate-400" />
        ) : (
          <DocumentIcon className="h-5 w-5 flex-shrink-0 text-slate-400" />
        )}
        <span className="line-clamp-2 w-full break-words">{name}</span>
      </>
    );

    return (
      <div className={`group relative min-w-0 ${wide ? "col-span-2" : ""}`}>
        {onOpenPreview ? (
          <button type="button" onClick={onOpenPreview} className={thumbClass}>
            {thumbContent}
          </button>
        ) : (
          <a href={url} target="_blank" rel="noreferrer" download={isLink ? undefined : name} className={thumbClass}>
            {thumbContent}
          </a>
        )}
        {taskLink && (
          <Link
            href={taskLink.href}
            className="mt-0.5 block truncate text-center text-[11px] text-slate-400 hover:text-slate-700 hover:underline"
          >
            → {taskLink.title}
          </Link>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            aria-label={isLink ? "Eliminar link" : "Eliminar archivo"}
            className="absolute top-1 right-1 rounded-full bg-white/90 p-1 text-slate-400 opacity-0 shadow-sm hover:text-red-600 group-hover:opacity-100"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`group relative ${wide ? "col-span-2" : ""}`}>
      <button type="button" onClick={onOpenImage} className="block w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={name} className="h-24 w-full rounded-xl border border-slate-200 object-cover" />
      </button>
      {taskLink && (
        <Link
          href={taskLink.href}
          className="mt-0.5 block truncate text-center text-[11px] text-slate-400 hover:text-slate-700 hover:underline"
        >
          → {taskLink.title}
        </Link>
      )}
      {canDelete && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          aria-label="Eliminar archivo"
          className="absolute top-1 right-1 rounded-full bg-white/90 p-1 text-slate-400 opacity-0 shadow-sm hover:text-red-600 group-hover:opacity-100"
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14M4 6h16M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
