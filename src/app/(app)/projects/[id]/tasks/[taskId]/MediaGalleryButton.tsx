"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ModalShell } from "@/components/Modal";
import { attachmentFileType, documentStyle } from "@/lib/attachments";
import { DocumentIcon, DownloadIcon, ExternalLinkIcon, EyeIcon, LinkIcon } from "@/components/icons";
import { AttachmentPreviewModal, isPreviewable } from "@/components/AttachmentPreviewModal";
import { AttachmentLightbox } from "./AttachmentLightbox";
import { listReusableMedia, reuseMedia, reuseMediaForAdjustment, type MediaItem } from "./mediaGallery";
import type { AttachmentKind, AdjustmentAttachmentKind } from "@prisma/client";

// «Galería»: elegir un archivo o link ya subido en el proyecto en vez de subirlo otra vez.
// Con `adjustmentItemId`, el elemento elegido se adjunta a ese ajuste (ej.
// Insumos) en vez de a la tarea directamente.
type Props =
  | { taskId: string; userId: string; kind: AttachmentKind; adjustmentItemId?: undefined }
  | { taskId: string; userId: string; kind: AdjustmentAttachmentKind; adjustmentItemId: string };

export function MediaGalleryButton(props: Props) {
  const { taskId, userId } = props;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  // Ver antes de elegir: imagen en el lightbox, documento en el visor de la app.
  const [viewing, setViewing] = useState<MediaItem | null>(null);

  async function openGallery() {
    setOpen(true);
    setError(null);
    const result = await listReusableMedia(taskId);
    if (result.ok) setItems(result.items);
    else setError(result.error);
  }

  async function pick(item: MediaItem) {
    setBusy(item.url);
    setError(null);
    const result = props.adjustmentItemId !== undefined
      ? await reuseMediaForAdjustment(props.adjustmentItemId, props.kind, item.url, userId)
      : await reuseMedia(taskId, props.kind, item.url, userId);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    setOpen(false);
    router.refresh();
  }

  const shown = (items ?? []).filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase()));
  const images = shown.filter((i) => attachmentFileType(i.mimeType) === "image").map((i) => ({ id: i.url, url: i.url, name: i.name }));
  const actionClass = "absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm hover:bg-white hover:text-[#0a6b78]";

  return (
    <>
      <button type="button" onClick={openGallery} className="flex-shrink-0 cursor-pointer rounded-lg border border-dashed border-slate-300 px-3 text-xs text-slate-500 hover:border-slate-400">
        Galería
      </button>
      <ModalShell open={open} onClose={() => setOpen(false)} title="Galería del proyecto">
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Elegí un archivo o enlace que ya está en el proyecto: no se sube de nuevo.</p>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre…" aria-label="Buscar en la galería" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          {items === null && !error && <p className="text-sm text-slate-400">Cargando…</p>}
          {items !== null && shown.length === 0 && <p className="text-sm text-slate-400">No hay archivos ni enlaces para mostrar.</p>}
          <ul className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {shown.map((item) => {
              const type = attachmentFileType(item.mimeType);
              const doc = documentStyle(item.mimeType, item.name);
              return (
                <li key={item.url} className="relative">
                  <button type="button" title={item.name} disabled={busy !== null} onClick={() => pick(item)} className="flex h-full w-full cursor-pointer flex-col gap-1 rounded-lg border border-slate-200 p-2 text-left hover:border-[#0a6b78] hover:bg-slate-50 disabled:opacity-50">
                    {type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.url} alt="" className="h-20 w-full rounded object-cover" />
                    ) : type === "link" ? (
                      <span className="flex h-20 w-full items-center justify-center rounded bg-slate-100 text-slate-400">
                        <LinkIcon className="h-7 w-7" />
                      </span>
                    ) : (
                      // Mismo color y etiqueta por tipo que la grilla de adjuntos (PDF rojo, Word azul…).
                      <span className={`flex h-20 w-full flex-col items-center justify-center gap-0.5 rounded ${doc.bg} ${doc.text}`}>
                        <DocumentIcon className="h-7 w-7" />
                        <span className="rounded bg-current/10 px-1 text-[10px] leading-4 font-bold tracking-wide">{item.name.includes(".") ? item.name.split(".").pop()!.toUpperCase() : doc.label}</span>
                      </span>
                    )}
                    <span className="truncate text-xs font-medium text-slate-700">{busy === item.url ? "Agregando…" : item.name}</span>
                  </button>
                  {type === "link" ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" title="Abrir enlace en otra pestaña" aria-label={`Abrir ${item.name}`} className={actionClass}>
                      <ExternalLinkIcon className="h-4 w-4" />
                    </a>
                  ) : type === "image" || isPreviewable(item.mimeType) ? (
                    <button type="button" onClick={() => setViewing(item)} title="Ver archivo" aria-label={`Ver ${item.name}`} className={actionClass}>
                      <EyeIcon className="h-4 w-4" />
                    </button>
                  ) : (
                    <a href={item.url} download={item.name} title="Descargar (no se puede mostrar aquí)" aria-label={`Descargar ${item.name}`} className={actionClass}>
                      <DownloadIcon className="h-4 w-4" />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </ModalShell>
      {viewing && attachmentFileType(viewing.mimeType) === "image" && (
        <AttachmentLightbox images={images} openId={viewing.url} onClose={() => setViewing(null)} onNavigate={(url) => setViewing({ ...viewing, url })} canDelete={false} />
      )}
      {viewing && attachmentFileType(viewing.mimeType) !== "image" && (
        <AttachmentPreviewModal file={{ id: viewing.url, url: viewing.url, name: viewing.name, mimeType: viewing.mimeType }} onClose={() => setViewing(null)} />
      )}
    </>
  );
}
