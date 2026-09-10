"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}
function getServerSnapshot() {
  return "";
}
function readLocal(key: string) {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

/**
 * "Proyectos" en el nav vuelve al último proyecto Y a los filtros/vista
 * (tablero/Gantt/calendario, persona, estado, alerta, mes/semana/día) que
 * tenías ahí la última vez, en vez de resetear siempre — mismo mecanismo que
 * ya usa Agenda (RememberViewState + esta lectura). Sin proyecto guardado,
 * vuelve a la lista /projects con SUS propios filtros recordados.
 *
 * Si ya estás dentro de un proyecto (vista interna), el link hace lo
 * contrario: te saca a la vista general /projects, para que no quede
 * "atrapado" apuntando siempre al mismo proyecto.
 */
export function ProjectsNavLink() {
  const pathname = usePathname();
  const insideProject = pathname?.startsWith("/projects/") ?? false;

  const projectId = useSyncExternalStore(subscribe, () => readLocal("lastProjectId"), getServerSnapshot);
  const paramsKey = insideProject ? "projectsBoard" : projectId ? `project:${projectId}` : "projectsBoard";
  const params = useSyncExternalStore(subscribe, () => readLocal(paramsKey), getServerSnapshot);

  const base = insideProject ? "/projects" : projectId ? `/projects/${projectId}` : "/projects";
  const href = params ? `${base}?${params}` : base;

  return <Link href={href}>Proyectos</Link>;
}
