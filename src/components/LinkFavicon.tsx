"use client";

import { useState, type ReactNode } from "react";
import { linkHostname } from "@/lib/attachments";

/**
 * Ícono de la página (favicon) de un link externo, a partir del dominio (lo busca /api/favicon).
 * Si no hay ícono o la URL no es válida, muestra `fallback` (por defecto nada: la ficha conserva su ícono de link).
 */
export function LinkFavicon({ url, className = "h-3.5 w-3.5", fallback = null }: { url: string; className?: string; fallback?: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed || !/^https?:\/\//i.test(url)) return fallback;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/favicon?host=${encodeURIComponent(linkHostname(url))}`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={`flex-shrink-0 rounded-sm ${className}`}
    />
  );
}
