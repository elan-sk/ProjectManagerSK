"use client";

import { linkHostname } from "@/lib/attachments";

/**
 * Ícono de la página (favicon) de un link externo, a partir del dominio (lo busca /api/favicon).
 * Si no hay ícono o la URL no es válida, no se muestra nada (la ficha conserva su ícono de link).
 */
export function LinkFavicon({ url, className = "h-3.5 w-3.5" }: { url: string; className?: string }) {
  if (!/^https?:\/\//i.test(url)) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/favicon?host=${encodeURIComponent(linkHostname(url))}`}
      alt=""
      loading="lazy"
      onError={(e) => (e.currentTarget.style.display = "none")}
      className={`flex-shrink-0 rounded-sm ${className}`}
    />
  );
}
