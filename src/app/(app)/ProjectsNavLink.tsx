"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}
function getSnapshot() {
  try {
    return localStorage.getItem("lastProject") ?? "";
  } catch {
    return "";
  }
}
function getServerSnapshot() {
  return "";
}

/**
 * "Proyectos" en el nav vuelve al último proyecto (y vista: tablero/gantt/
 * calendario) que estabas viendo, en vez de resetear siempre a la lista —
 * la lista completa sigue disponible desde "Todos los proyectos" dentro de
 * cada proyecto. useSyncExternalStore (no useEffect+setState) para leer
 * localStorage sin desincronizar el render de servidor y cliente.
 */
export function ProjectsNavLink() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  let href = "/projects";
  if (raw) {
    try {
      const { id, view } = JSON.parse(raw);
      if (id) href = view && view !== "kanban" ? `/projects/${id}?view=${view}` : `/projects/${id}`;
    } catch {
      // dato corrupto en localStorage — se queda en /projects
    }
  }

  return <Link href={href}>Proyectos</Link>;
}
