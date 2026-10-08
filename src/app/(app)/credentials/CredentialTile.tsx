"use client";

import { useState } from "react";
import { ModalShell } from "@/components/Modal";
import { KeyIcon } from "@/components/icons";
import { CredentialLoader } from "./CredentialView";
import type { CredentialPlace } from "@/lib/credentialPlace";

/**
 * Ficha de una credencial dentro de las grillas de archivos (Archivos, Definición, insumos de una
 * tarea). Solo muestra el nombre: URL, usuario y contraseña se piden al abrirla, y solo si la persona
 * tiene acceso. `place`: tarea, paso o ajuste donde está (permite quitarla de ahí).
 */
export function CredentialTile({
  credentialId,
  name,
  subtitle,
  place,
  canRemove,
  footer,
}: {
  credentialId: string;
  name: string;
  /** URL de la contraseña (sin protocolo); sin URL se muestra «Contraseña». */
  subtitle?: string;
  /** Tarea, paso o ajuste donde se muestra: su visor ofrece quitarla de ahí (si `canRemove`). */
  place?: CredentialPlace;
  canRemove?: boolean;
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
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
      <ModalShell open={open} onClose={() => setOpen(false)} title="Contraseña">
        <CredentialLoader credentialId={credentialId} place={place} canRemove={canRemove} onClose={() => setOpen(false)} />
      </ModalShell>
    </div>
  );
}
