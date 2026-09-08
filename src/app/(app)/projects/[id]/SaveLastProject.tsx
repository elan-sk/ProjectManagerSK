"use client";

import { useEffect } from "react";

/**
 * Guarda cuál fue el ÚLTIMO proyecto visitado, para que el nav "Proyectos"
 * vuelva ahí en vez de resetear siempre a la lista. Los filtros/vista de ese
 * proyecto puntual los guarda RememberViewState (storageKey `project:<id>`,
 * agregado en la misma página) — esto solo resuelve el "cuál".
 */
export function SaveLastProject({ projectId }: { projectId: string }) {
  useEffect(() => {
    try {
      localStorage.setItem("lastProjectId", projectId);
    } catch {
      // localStorage no disponible (modo privado, etc.) — no es crítico
    }
  }, [projectId]);

  return null;
}
