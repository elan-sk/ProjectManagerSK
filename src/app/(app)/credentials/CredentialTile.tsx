"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ModalShell } from "@/components/Modal";
import { KeyIcon } from "@/components/icons";
import { LinkFavicon } from "@/components/LinkFavicon";
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
  layout = "tile",
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
  /** «tile»: como la ficha de un documento (grillas mezcladas). «card»: horizontal, como los Links compartidos (sección Contraseñas de Archivos). */
  layout?: "tile" | "card";
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
  // URL de la contraseña con el ícono de su página al lado.
  const urlLine = subtitle && (
    <span className="flex min-w-0 max-w-full items-center gap-1 text-[11px] text-slate-400" title={subtitle}>
      <LinkFavicon url={`https://${subtitle}`} className="h-3 w-3" />
      <span className="truncate">{subtitle}</span>
    </span>
  );
  return (
    <div className="group relative min-w-0">
      {layout === "card" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative flex h-24 w-full min-w-0 items-stretch overflow-hidden rounded-xl border-2 border-red-600/40 bg-white text-left shadow-sm transition hover:border-red-600 hover:shadow"
        >
          {/* Mismo formato que los Links compartidos, en rojo por ser un dato de seguridad (pedido del usuario). */}
          <span className="flex w-9 flex-shrink-0 items-center justify-center bg-red-600 text-white">
            <KeyIcon className="h-4 w-4" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 pl-2.5 pr-7">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-red-700">Contraseña</span>
            <span className="line-clamp-2 break-words text-xs font-medium text-slate-800">{name}</span>
            {urlLine}
          </span>
        </button>
      ) : (
        // Entre documentos: mismo formato que la ficha de un documento (ícono, etiqueta y nombre), con la llave y en rojo.
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={name}
          className="flex h-24 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-red-600/30 bg-red-600/10 px-2 py-1.5 text-center text-xs text-red-700 transition-colors duration-150 hover:border-red-600 hover:bg-red-600/20"
        >
          <span className="flex flex-shrink-0 flex-col items-center gap-0.5">
            <KeyIcon className="h-6 w-6" />
            <span className="rounded bg-current/10 px-1 text-[10px] leading-4 font-bold tracking-wide">CONTRASEÑA</span>
          </span>
          <span className="line-clamp-1 w-full break-words font-medium text-red-900">{name}</span>
          {urlLine}
        </button>
      )}
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
