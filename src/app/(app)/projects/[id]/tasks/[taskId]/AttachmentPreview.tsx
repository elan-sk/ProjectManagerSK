"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DocumentIcon, LinkIcon } from "@/components/icons";
import { removeAttachment } from "./actions";
import { LINK_MIME_TYPE } from "@/lib/attachments";
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
}: {
  id: string;
  url: string;
  name: string;
  mimeType: string;
  canDelete: boolean;
  /** Solo en la vista "Archivos" del proyecto, que junta adjuntos de varias tareas — lleva de vuelta a la tarea dueña. */
  taskLink?: { href: string; title: string };
  onOpenImage?: () => void;
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

  if (!isImage) {
    return (
      <div className="group relative min-w-0">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          download={isLink ? undefined : name}
          className="flex h-24 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 p-2 text-center text-xs text-slate-500"
        >
          {isLink ? (
            <LinkIcon className="h-5 w-5 flex-shrink-0 text-slate-400" />
          ) : (
            <DocumentIcon className="h-5 w-5 flex-shrink-0 text-slate-400" />
          )}
          <span className="line-clamp-2 w-full break-words">{name}</span>
        </a>
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
    <div className="group relative">
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
