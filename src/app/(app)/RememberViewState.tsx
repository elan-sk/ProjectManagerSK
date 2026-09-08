"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/** Guarda los filtros/parámetros actuales de la URL bajo `storageKey`, para que NavLinkWithMemory vuelva acá con el mismo estado. */
export function RememberViewState({ storageKey }: { storageKey: string }) {
  const search = useSearchParams().toString();

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, search);
    } catch {
      // localStorage no disponible — no es crítico
    }
  }, [storageKey, search]);

  return null;
}
