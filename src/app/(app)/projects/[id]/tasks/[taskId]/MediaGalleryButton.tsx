"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ModalShell } from "@/components/Modal";
import { attachmentFileType } from "@/lib/attachments";
import { DocumentIcon, LinkIcon } from "@/components/icons";
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
              return (
                <li key={item.url}>
                  <button type="button" disabled={busy !== null} onClick={() => pick(item)} className="flex h-full w-full cursor-pointer flex-col gap-1 rounded-lg border border-slate-200 p-2 text-left hover:border-[#0a6b78] hover:bg-slate-50 disabled:opacity-50">
                    {type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.url} alt="" className="h-20 w-full rounded object-cover" />
                    ) : (
                      <span className="flex h-20 w-full items-center justify-center rounded bg-slate-100 text-slate-400">
                        {type === "link" ? <LinkIcon className="h-7 w-7" /> : <DocumentIcon className="h-7 w-7" />}
                      </span>
                    )}
                    <span className="truncate text-xs font-medium text-slate-700">{busy === item.url ? "Agregando…" : item.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </ModalShell>
    </>
  );
}
