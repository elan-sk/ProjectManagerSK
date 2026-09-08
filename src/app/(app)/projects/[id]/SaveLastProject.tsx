"use client";

import { useEffect } from "react";

/**
 * Guarda el proyecto y la vista actuales para que el nav "Proyectos" vuelva
 * acá ("lastProject", un solo slot global) y ADEMÁS la vista de ESTE
 * proyecto puntual bajo su propia clave ("lastView:<id>") — a diferencia del
 * slot global, esta no se pisa cuando el usuario visita otro proyecto
 * después, así un link a una alerta de un proyecto viejo igual sabe en qué
 * vista (tablero/Gantt/calendario) lo dejaste la última vez.
 */
export function SaveLastProject({ projectId, view }: { projectId: string; view: string }) {
  useEffect(() => {
    try {
      localStorage.setItem("lastProject", JSON.stringify({ id: projectId, view }));
      localStorage.setItem(`lastView:${projectId}`, view);
    } catch {
      // localStorage no disponible (modo privado, etc.) — no es crítico
    }
  }, [projectId, view]);

  return null;
}
