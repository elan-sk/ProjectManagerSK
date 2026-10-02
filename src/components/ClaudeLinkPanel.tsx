"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/Confirm";
import { useToast } from "@/components/Toast";
import { createClaudeLink, revokeMyClaudeLink } from "@/app/(app)/shareActions";

/**
 * Link para pegar en un chat de IA (claude.ai o Claude Code) y que trabaje en
 * PMSK con los permisos de quien lo genera. Vale hasta que la tarea se
 * completa, pasan 7 días sin uso o se desactiva (ver createClaudeLinkToken).
 * Solo se guarda el hash del token: el link se muestra una única vez, al
 * generarlo — por eso del activo solo se conoce su último uso.
 */
export function ClaudeLinkPanel({
  projectId,
  taskId,
  activeLastUsedLabel,
}: {
  projectId?: string;
  taskId?: string;
  activeLastUsedLabel: string | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const showToast = useToast();
  const [isPending, startTransition] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const target = taskId ? { taskId } : { projectId: projectId! };

  async function handleCreate() {
    if (activeLastUsedLabel && !url) {
      const ok = await confirm("Ya hay un link activo. Al generar uno nuevo, el anterior deja de funcionar.", {
        confirmLabel: "Generar nuevo",
      });
      if (!ok) return;
    }
    startTransition(async () => {
      const result = await createClaudeLink(target);
      if (!result.ok) {
        showToast(result.error ?? "No se pudo generar el link.");
        return;
      }
      setUrl(`${window.location.origin}/api/v1/claude-link/${result.token}`);
      setCopied(false);
      router.refresh();
    });
  }

  async function handleRevoke() {
    const ok = await confirm("¿Desactivar el link? El chat que lo esté usando pierde el acceso de inmediato.", {
      confirmLabel: "Desactivar",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await revokeMyClaudeLink(target);
      if (!result.ok) {
        showToast(result.error ?? "No se pudo desactivar el link.");
        return;
      }
      setUrl(null);
      router.refresh();
    });
  }

  function handleCopy() {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        Genera un link para pegar en un chat de IA, que trabaja con los mismos permisos de esta cuenta. Se puede usar las veces
        que haga falta{taskId ? " hasta que la tarea se complete" : ""}; deja de funcionar tras 7 días sin uso o al desactivarlo.
      </p>
      {url ? (
        <>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={url}
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
          <p className="text-xs text-amber-700">Este link solo se muestra ahora. Si se pierde, hay que generar otro.</p>
        </>
      ) : (
        activeLastUsedLabel && (
          <p className="text-xs text-emerald-700">Hay un link activo. Último uso: {activeLastUsedLabel}</p>
        )
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={handleCreate}
          className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {isPending ? "Procesando…" : activeLastUsedLabel || url ? "Generar link nuevo" : "Generar link"}
        </button>
        {(activeLastUsedLabel || url) && (
          <button
            type="button"
            disabled={isPending}
            onClick={handleRevoke}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
          >
            Desactivar
          </button>
        )}
      </div>
    </div>
  );
}
