"use client";

import { isDuplicate } from "@/lib/duplicateNotice";
import { useDuplicateNotice } from "@/lib/useDuplicateNotice";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ModalShell } from "@/components/Modal";
import { attachmentFileType, credentialIdFromRef, documentStyle, youtubeVideoId } from "@/lib/attachments";
import { DocumentIcon, DownloadIcon, ExternalLinkIcon, EyeIcon, KeyIcon, LinkIcon } from "@/components/icons";
import { AttachmentPreviewModal, isPreviewable } from "@/components/AttachmentPreviewModal";
import { AttachmentLightbox } from "./AttachmentLightbox";
import { YouTubeModal } from "@/components/YouTubeModal";
import { CredentialLoader } from "../../../../credentials/CredentialView";
import { listCommentMedia } from "@/app/(app)/internalMessageActions";
import { listReusableMedia, reuseMedia, reuseMediaForAdjustment, reuseMediaForStep, type MediaItem } from "./mediaGallery";
import type { AttachmentKind, AdjustmentAttachmentKind } from "@prisma/client";

// «Galería»: elegir un archivo o link ya subido en el proyecto en vez de subirlo otra vez.
// Con `adjustmentItemId`, el elemento elegido se adjunta a ese ajuste (ej.
// Insumos) en vez de a la tarea directamente; con `stepId`, a ese paso del checklist.
// Con `open`/`onClose` se abre desde afuera (ej. el menú del clip de un paso) y no
// pinta su propio botón. Con `comment`, no adjunta nada: entrega el elemento elegido
// (el formulario de comentario lo inserta en el texto) y no ofrece contraseñas.
type None = { userId?: undefined; kind?: undefined; adjustmentItemId?: undefined; stepId?: undefined; comment?: undefined };
type Target =
  | (Omit<None, "userId" | "kind"> & { taskId: string; userId: string; kind: AttachmentKind })
  | (Omit<None, "userId" | "kind" | "adjustmentItemId"> & { taskId: string; userId: string; kind: AdjustmentAttachmentKind; adjustmentItemId: string })
  | (Omit<None, "stepId"> & { taskId: string; stepId: string })
  | (Omit<None, "comment"> & { taskId?: undefined; comment: { projectId: string; taskId: string | null; onPick: (item: MediaItem) => void } });
type Props = Target & { open?: boolean; onClose?: () => void };

export function MediaGalleryButton(props: Props) {
  const { taskId, comment } = props;
  const router = useRouter();
  const notifyDuplicate = useDuplicateNotice();
  const [ownOpen, setOwnOpen] = useState(false);
  const controlled = props.open !== undefined;
  const open = controlled ? props.open! : ownOpen;
  const setOpen = (v: boolean) => (controlled ? !v && props.onClose?.() : setOwnOpen(v));
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  // Ver antes de elegir: imagen en el lightbox, documento en el visor de la app.
  const [viewing, setViewing] = useState<MediaItem | null>(null);

  // Se recarga cada vez que se abre (puede haber archivos nuevos desde la última vez).
  useEffect(() => {
    if (!open) return;
    (comment ? listCommentMedia(comment.projectId, comment.taskId) : listReusableMedia(taskId!)).then((result) => {
      setError(result.ok ? null : result.error);
      if (result.ok) setItems(result.items);
    });
  }, [open, taskId, comment?.projectId, comment?.taskId]); // eslint-disable-line react-hooks/exhaustive-deps -- `comment` es un objeto nuevo en cada render

  async function pick(item: MediaItem) {
    if (comment) {
      comment.onPick(item);
      setOpen(false);
      return;
    }
    setBusy(item.url);
    setError(null);
    const result = props.stepId !== undefined
      ? await reuseMediaForStep(props.stepId, item.url)
      : props.adjustmentItemId !== undefined
        ? await reuseMediaForAdjustment(props.adjustmentItemId, props.kind, item.url, props.userId)
        : await reuseMedia(taskId!, props.kind!, item.url, props.userId!);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    if (isDuplicate(result)) notifyDuplicate([item.name]);
    setOpen(false);
    router.refresh();
  }

  // Contraseñas: en los insumos de la tarea, en los pasos y en los insumos de un ajuste (no en evidencias ni antes/después).
  const allowsCredentials = props.stepId !== undefined || props.kind === "INSUMO";
  const shown = (items ?? [])
    .filter((i) => allowsCredentials || attachmentFileType(i.mimeType) !== "credential")
    .filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase()));
  const images = shown.filter((i) => attachmentFileType(i.mimeType) === "image").map((i) => ({ id: i.url, url: i.url, name: i.name }));
  const actionClass = "absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm hover:bg-white hover:text-[#0a6b78]";

  return (
    <>
      {!controlled && (
        <button type="button" onClick={() => setOpen(true)} className="flex-shrink-0 cursor-pointer rounded-lg border border-dashed border-slate-300 px-3 text-xs text-slate-500 hover:border-slate-400">
          Galería
        </button>
      )}
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
              const videoId = type === "link" ? youtubeVideoId(item.url) : null;
              return (
                <li key={item.url} className="relative">
                  <button type="button" title={item.name} disabled={busy !== null} onClick={() => pick(item)} className="flex h-full w-full cursor-pointer flex-col gap-1 rounded-lg border border-slate-200 p-2 text-left hover:border-[#0a6b78] hover:bg-slate-50 disabled:opacity-50">
                    {type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.url} alt="" className="h-20 w-full rounded object-cover" />
                    ) : videoId ? (
                      // Video de YouTube: miniatura con play, igual que la grilla de adjuntos.
                      <span className="relative h-20 w-full overflow-hidden rounded">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`} alt="" className="h-full w-full object-cover" />
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow">
                            <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 h-4 w-4"><path d="M8 5v14l11-7z" /></svg>
                          </span>
                        </span>
                      </span>
                    ) : type === "credential" ? (
                      <span className="flex h-20 w-full flex-col items-center justify-center gap-1 rounded bg-red-600/10 text-red-700">
                        <KeyIcon className="h-7 w-7" />
                        <span className="text-[10px] font-bold tracking-wide">CONTRASEÑA</span>
                      </span>
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
                  {type === "credential" ? (
                    <button type="button" onClick={() => setViewing(item)} title="Ver contraseña" aria-label={`Ver ${item.name}`} className={actionClass}>
                      <EyeIcon className="h-4 w-4" />
                    </button>
                  ) : type === "link" && !videoId ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" title="Abrir enlace en otra pestaña" aria-label={`Abrir ${item.name}`} className={actionClass}>
                      <ExternalLinkIcon className="h-4 w-4" />
                    </a>
                  ) : videoId || type === "image" || isPreviewable(item.mimeType) ? (
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
      {viewing && youtubeVideoId(viewing.url) && (
        <YouTubeModal videoId={youtubeVideoId(viewing.url)!} title={viewing.name} onClose={() => setViewing(null)} />
      )}
      {viewing && attachmentFileType(viewing.mimeType) === "document" && (
        <AttachmentPreviewModal file={{ id: viewing.url, url: viewing.url, name: viewing.name, mimeType: viewing.mimeType }} onClose={() => setViewing(null)} />
      )}
      {/* Contraseña: su visor de siempre (pide los datos al servidor y respeta quién puede verla), sin agregarla. */}
      {viewing && attachmentFileType(viewing.mimeType) === "credential" && credentialIdFromRef(viewing.url) && (
        <ModalShell open onClose={() => setViewing(null)} title="Contraseña">
          <CredentialLoader credentialId={credentialIdFromRef(viewing.url)!} onClose={() => setViewing(null)} />
        </ModalShell>
      )}
    </>
  );
}
