"use client";

import { useEffect } from "react";

export const RECENT_PROJECT_IDS_KEY = "recentProjectIds";

/**
 * Guarda cuál fue el ÚLTIMO proyecto visitado, para que el nav "Proyectos"
 * vuelva ahí en vez de resetear siempre a la lista. Los filtros/vista de ese
 * proyecto puntual los guarda RememberViewState (storageKey `project:<id>`,
 * agregado en la misma página) — esto solo resuelve el "cuál".
 *
 * También guarda el historial completo de visitas (más reciente primero) en
 * RECENT_PROJECT_IDS_KEY, que ProjectCardsOrder usa para ordenar la lista de
 * /projects por "último abierto primero" (punto pedido por el usuario).
 */
export function SaveLastProject({ projectId }: { projectId: string }) {
  useEffect(() => {
    try {
      localStorage.setItem("lastProjectId", projectId);
      const recent: string[] = JSON.parse(localStorage.getItem(RECENT_PROJECT_IDS_KEY) ?? "[]");
      const next = [projectId, ...recent.filter((id) => id !== projectId)];
      localStorage.setItem(RECENT_PROJECT_IDS_KEY, JSON.stringify(next));
    } catch {
      // localStorage no disponible (modo privado, etc.) — no es crítico
    }
  }, [projectId]);

  return null;
}
