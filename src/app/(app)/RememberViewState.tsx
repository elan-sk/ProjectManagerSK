"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/** Guarda los filtros/parámetros actuales de la URL bajo `storageKey`, para que NavLinkWithMemory vuelva acá con el mismo estado. */
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
    } catch {
      // localStorage no disponible — no es crítico
    }
  }, [storageKey, search]);

  return null;
}
