"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { viewCookieName } from "@/lib/viewCookie";

/**
 * Guarda los filtros/parámetros actuales de la URL bajo `storageKey`, para que NavLinkWithMemory vuelva acá con el mismo estado.
 * También los deja en una cookie: así el servidor puede abrir la página DIRECTO en la última vista
 * (redirect en page.tsx), sin dibujar antes la vista por defecto.
 */
export function RememberViewState({
  storageKey,
  excludeParams,
}: {
  storageKey: string;
  /** Parámetros que nunca se recuerdan — vuelven siempre a su valor por defecto (ej. el filtro "Recientes" de Proyectos). */
  excludeParams?: string[];
}) {
  const searchParams = useSearchParams();
  const search = (() => {
    if (!excludeParams?.length) return searchParams.toString();
    const p = new URLSearchParams(searchParams);
    for (const k of excludeParams) p.delete(k);
    return p.toString();
  })();

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, search);
      document.cookie = `${viewCookieName(storageKey)}=${encodeURIComponent(search)}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      // localStorage/cookies no disponibles — no es crítico
    }
  }, [storageKey, search]);

  return null;
}
