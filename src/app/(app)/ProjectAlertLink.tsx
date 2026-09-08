"use client";

import { useRouter } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";

function subscribe() {
  return () => {};
}
function getServerSnapshot() {
  return "";
}

/**
 * Badge clickeable de una alerta agregada ("N atrasadas" en la lista de
 * Proyectos): lleva al proyecto, a la ÚLTIMA vista que se usó ahí
 * (tablero/Gantt/calendario, guardada por SaveLastProject bajo
 * "lastView:<id>") con el filtro de riesgo ya aplicado — en vez de resetear
 * siempre al tablero. No es un <a> porque vive DENTRO del <Link> que cubre
 * toda la card del proyecto (un <a> anidado en otro <a> es HTML inválido) —
 * por eso navega con router.push y frena la propagación para no disparar
 * también el click del link contenedor.
 */
export function ProjectAlertLink({
  projectId,
  risk,
  className,
  children,
}: {
  projectId: string;
  risk: "overdue" | "warning";
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const view = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(`lastView:${projectId}`) ?? "";
      } catch {
        return "";
      }
    },
    getServerSnapshot
  );

  const params = new URLSearchParams({ risk });
  if (view && view !== "kanban") params.set("view", view);

  return (
    <span
      role="link"
      tabIndex={0}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        router.push(`/projects/${projectId}?${params.toString()}`);
      }}
      className={`${className ?? ""} cursor-pointer`}
    >
      {children}
    </span>
  );
}
