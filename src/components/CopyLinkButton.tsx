"use client";

import { useState } from "react";
import { ShareIcon, CheckIcon } from "@/components/icons";

/**
 * Indicador de "este proyecto/tarea tiene un link compartido activo" +
 * copiar con un clic, sin tener que abrir el modal "Compartir" para verlo.
 * Recibe el token (no la URL completa): el origin solo se conoce del lado
 * del cliente, mismo criterio que ShareLinkPanel.
 */
export function CopyLinkButton({ token, className }: { token: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}/share/${token}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      onPointerDown={(e) => e.stopPropagation()}
      title={copied ? "¡Copiado!" : "Tiene link compartido activo — copiar"}
      className={className ?? "flex-shrink-0 text-indigo-500 hover:text-indigo-700"}
    >
      {copied ? (
        <CheckIcon className="h-3 w-3 text-emerald-500" />
      ) : (
        <ShareIcon className="h-3 w-3" />
      )}
    </button>
  );
}
