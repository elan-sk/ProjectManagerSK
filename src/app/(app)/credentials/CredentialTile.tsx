"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ModalShell } from "@/components/Modal";
import { KeyIcon } from "@/components/icons";
import { useConfirm } from "@/components/Confirm";
import { useToast } from "@/components/Toast";
import { CredentialLoader } from "./CredentialView";
import { deleteCredential, unlinkCredential } from "./actions";
import { removeFromPlaceLabel, type CredentialPlace } from "@/lib/credentialPlace";

/**
 * Ficha de una credencial dentro de las grillas de archivos (Archivos, Definición, insumos de una
 * tarea). Solo muestra el nombre: URL, usuario y contraseña se piden al abrirla, y solo si la persona
 * tiene acceso. `place`: tarea, paso o ajuste donde está — su papelera la quita de ahí como a un
 * archivo más: si vino de la galería, la original sigue en el proyecto; si se creó ahí (`canDelete`),
 * pregunta si se elimina del todo o solo se quita.
 */
export function CredentialTile({
  credentialId,
  name,
  subtitle,
  place,
  canRemove,
  canDelete = false,
  footer,
}: {
  credentialId: string;
  name: string;
  /** URL de la contraseña (sin protocolo); sin URL se muestra «Contraseña». */
  subtitle?: string;
  /** Tarea, paso o ajuste donde se muestra: su visor ofrece quitarla de ahí (si `canRemove`). */
  place?: CredentialPlace;
  canRemove?: boolean;
  /** Se creó en este lugar y la persona puede eliminarla: al quitarla se ofrece eliminarla del todo. */
  canDelete?: boolean;
  footer?: React.ReactNode;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const removeLabel = place && canRemove ? removeFromPlaceLabel(place) : null;

  async function run(action: () => Promise<{ ok: boolean; error?: string }>, fallback: string) {
    setBusy(true);
    const result = await action().catch(() => ({ ok: false, error: fallback }));
    setBusy(false);
    setChoosing(false);
    if (!result.ok) return showToast(result.error ?? fallback);
    router.refresh();
  }
  const unlink = () => run(() => unlinkCredential(credentialId, place!), "No se pudo quitar la contraseña.");

  async function handleRemove() {
    if (canDelete) return setChoosing(true);
    const ok = await confirm(`¿${removeLabel} "${name}"? La contraseña sigue disponible en el proyecto.`, { confirmLabel: "Quitar" });
    if (ok) await unlink();
  }
  return (
    <div className="group relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex h-24 w-full min-w-0 items-stretch overflow-hidden rounded-xl border border-[#0a6b78]/25 bg-white text-left transition-colors hover:border-[#0a6b78]/60 hover:bg-slate-50"
      >
        <span className="flex w-9 flex-shrink-0 items-center justify-center bg-[#0a6b78]/10 text-[#0a6b78]">
          <KeyIcon className="h-4 w-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-2.5">
          <span className="line-clamp-2 break-words text-xs font-medium text-slate-800">{name}</span>
          {/* La llave y la sección ya dicen que es una contraseña: debajo va su URL (pedido del usuario). */}
          <span className="truncate text-[11px] text-slate-400" title={subtitle}>
            {subtitle ?? "Contraseña"}
          </span>
        </span>
      </button>
      {footer}
      {removeLabel && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={busy}
          aria-label={removeLabel}
          title={removeLabel}
          className="absolute top-1 right-1 rounded-full bg-white/90 p-1 text-slate-400 opacity-0 shadow-sm hover:text-red-600 group-hover:opacity-100"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14M4 6h16M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      )}
      <ModalShell open={choosing} onClose={() => setChoosing(false)} title="Quitar contraseña">
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            «{name}» se creó aquí. Se puede quitar solo de este lugar (sigue disponible en el proyecto) o eliminarla definitivamente del proyecto y de todas las
            tareas donde está. Eliminarla no se puede deshacer.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setChoosing(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
            <button type="button" disabled={busy} onClick={unlink} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              Solo quitar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => deleteCredential(credentialId), "No se pudo eliminar la contraseña.")}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              Eliminar definitivamente
            </button>
          </div>
        </div>
      </ModalShell>
      <ModalShell open={open} onClose={() => setOpen(false)} title="Contraseña">
        <CredentialLoader credentialId={credentialId} place={place} canRemove={canRemove} onClose={() => setOpen(false)} />
      </ModalShell>
    </div>
  );
}
