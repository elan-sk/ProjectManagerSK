"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/Confirm";
import { useToast } from "@/components/Toast";

type ActionResult = { ok: true; token?: string } | { ok: false; error?: string };

/**
 * Generar/revocar el link público de solo lectura de un proyecto o tarea.
 * Genérico: recibe las server actions ya "bindeadas" al id correspondiente.
 */
export function ShareLinkPanel({
  activeToken,
  activeLinkId,
  onCreate,
  onRevoke,
}: {
  activeToken: string | null;
  activeLinkId: string | null;
  onCreate: () => Promise<ActionResult>;
  onRevoke: (linkId: string) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const showToast = useToast();
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const shareUrl = activeToken && typeof window !== "undefined" ? `${window.location.origin}/share/${activeToken}` : null;

  function handleCreate() {
    startTransition(async () => {
      const result = await onCreate();
      if (!result.ok) showToast(result.error ?? "No se pudo generar el link.");
      else router.refresh();
    });
  }

  async function handleRevoke() {
    if (!activeLinkId) return;
    const ok = await confirm("¿Seguro que querés desactivar este link? Quien lo tenga ya no va a poder entrar.", {
      confirmLabel: "Desactivar",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await onRevoke(activeLinkId);
      if (!result.ok) showToast(result.error ?? "No se pudo desactivar el link.");
      else router.refresh();
    });
  }

  function handleCopy() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-2">
      {shareUrl ? (
        <>
          <p className="text-xs text-slate-500">
            Cualquiera con este link puede ver una versión resumida (sin datos internos), y sumar archivos, links o comentarios —
            nunca puede editar ni eliminar nada existente. Generar uno nuevo desactiva este.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={shareUrl}
              onFocus={(e) => e.target.select()}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-600"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="flex-shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {copied ? "¡Copiado!" : "Copiar"}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={handleCreate}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Generar link nuevo
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={handleRevoke}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
            >
              Desactivar
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          disabled={isPending}
          onClick={handleCreate}
          className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {isPending ? "Generando…" : "Generar link para compartir"}
        </button>
      )}
    </div>
  );
}
