"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Guarda los filtros/parámetros actuales de la URL bajo `storageKey`, para que NavLinkWithMemory vuelva acá con el mismo estado. */
export function RememberViewState({
  storageKey,
  excludeParams,
  restore,
}: {
  storageKey: string;
  /** Parámetros que nunca se recuerdan — vuelven siempre a su valor por defecto (ej. el filtro "Recientes" de Proyectos). */
  excludeParams?: string[];
  /** Si se abre la página SIN filtros (link suelto: buscador, aviso, lista…), reaplica los últimos guardados. Usar con `key={storageKey}`. */
  restore?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const firstRun = useRef(true);
  const search = (() => {
    if (!excludeParams?.length) return searchParams.toString();
    const p = new URLSearchParams(searchParams);
    for (const k of excludeParams) p.delete(k);
    return p.toString();
  })();

  useEffect(() => {
    try {
      // Sin esto, cualquier link sin filtros pisaba con "" lo guardado y la vista "se reseteaba".
      if (firstRun.current) {
        firstRun.current = false;
        const saved = localStorage.getItem(storageKey);
        if (restore && !search && saved) {
          router.replace(`${pathname}?${saved}`);
          return;
        }
      }
      localStorage.setItem(storageKey, search);
    } catch {
      // localStorage no disponible — no es crítico
    }
  }, [storageKey, search, restore, pathname, router]);

  return null;
}
