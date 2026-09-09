"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { ReferencePopover, type ReferenceItem } from "@/components/ReferencePopover";

function subscribe() {
  return () => {};
}
function getServerSnapshot() {
  return "";
}

/**
 * Badge de una alerta agregada ("N atrasadas" en la lista de Proyectos):
 * click abre un popup con las tareas puntuales (link directo a cada una) +
 * un acceso a la vista filtrada del proyecto, a los ÚLTIMOS filtros/vista
 * que tenías ahí (guardados por RememberViewState bajo "project:<id>" —
 * vista, persona, estado, mes/semana/día), pisando solo el filtro de riesgo
 * — en vez de resetear todo. Delega en ReferencePopover, que ya resuelve
 * (vía spans + router.push) el problema de vivir DENTRO del <Link> que cubre
 * toda la card del proyecto.
 */
export function ProjectAlertLink({
  projectId,
  risk,
  items,
  className,
  children,
}: {
  projectId: string;
  risk: "overdue" | "warning";
  items: ReferenceItem[];
  className?: string;
  children: ReactNode;
}) {
  const saved = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(`project:${projectId}`) ?? "";
      } catch {
        return "";
      }
    },
    getServerSnapshot
  );

  const params = new URLSearchParams(saved);
  params.set("risk", risk);

  return (
    <ReferencePopover
      trigger={children}
      items={items}
      filteredHref={`/projects/${projectId}?${params.toString()}`}
      filteredLabel="Ver en el tablero del proyecto"
      className={className}
    />
  );
}
