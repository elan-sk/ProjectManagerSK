"use client";

import { useState } from "react";
import { useRouter } from "@/lib/useAppRouter";
import { ModalShell } from "@/components/Modal";
import { XIcon } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { setTaskCover } from "../../taskOps";

// Portada de la tarea (imagen de su card, como Trello): por defecto la primera imagen
// adjunta; se puede elegir otra o dejarla sin portada. Regla de qué se muestra: taskCover.ts.
export function TaskCoverPicker({
  taskId,
  images,
  coverAttachmentId,
  coverHidden,
  canEdit,
}: {
  taskId: string;
  /** Imágenes adjuntas a la tarea, de la más antigua a la más nueva. */
  images: { id: string; url: string; name: string }[];
  coverAttachmentId: string | null;
  coverHidden: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const chosen = images.find((i) => i.id === coverAttachmentId);
  const current = coverHidden ? "none" : chosen ? chosen.id : "first";
  const coverUrl = coverHidden ? null : (chosen ?? images[0])?.url ?? null;

  async function pick(cover: string) {
    if (cover === current) return setOpen(false);
    setBusy(true);
    const result = await setTaskCover(taskId, cover);
    setBusy(false);
    if (!result.ok) return showToast(result.error);
    setOpen(false);
    router.refresh();
  }

  const tile = (selected: boolean) =>
    `flex h-full w-full cursor-pointer flex-col gap-1 rounded-lg border p-2 text-left hover:bg-slate-50 disabled:opacity-50 ${selected ? "border-[#0a6b78] ring-2 ring-[#0a6b78]/30" : "border-slate-200 hover:border-[#0a6b78]"}`;

  return (
    <div className="flex flex-shrink-0 flex-col gap-1 sm:mt-2">
      <span className="text-sm font-medium text-slate-600">Portada:</span>
      <div className="flex w-fit flex-col items-end gap-1">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="block h-20 w-34 rounded-lg object-cover ring-1 ring-slate-200" />
        ) : (
          <span className="text-sm text-slate-400">Sin portada</span>
        )}
        {canEdit && (
          <button type="button" onClick={() => setOpen(true)} className="cursor-pointer text-xs text-slate-400 hover:text-slate-600 hover:underline">
            Cambiar
          </button>
        )}
      </div>
      <ModalShell open={open} onClose={() => setOpen(false)} title="Portada de la tarea">
        <ul className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
          <li>
            <button type="button" disabled={busy} onClick={() => pick("first")} className={tile(current === "first")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={images[0].url} alt="" className="h-20 w-full rounded object-cover" />
              <span className="truncate text-xs font-medium text-slate-700">Primera imagen</span>
            </button>
          </li>
          <li>
            <button type="button" disabled={busy} onClick={() => pick("none")} className={tile(current === "none")}>
              <span className="flex h-20 w-full items-center justify-center rounded bg-slate-100 text-slate-400">
                <XIcon className="h-7 w-7" />
              </span>
              <span className="truncate text-xs font-medium text-slate-700">Sin portada</span>
            </button>
          </li>
          {images.map((image) => (
            <li key={image.id}>
              <button type="button" title={image.name} disabled={busy} onClick={() => pick(image.id)} className={tile(current === image.id)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt="" className="h-20 w-full rounded object-cover" />
                <span className="truncate text-xs font-medium text-slate-700">{image.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </ModalShell>
    </div>
  );
}
