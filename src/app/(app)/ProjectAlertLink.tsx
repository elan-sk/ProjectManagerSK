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
 * Proyectos): lleva al proyecto, a los ÚLTIMOS filtros/vista que tenías ahí
 * (guardados por RememberViewState bajo "project:<id>" — vista, persona,
 * estado, mes/semana/día), pisando solo el filtro de riesgo — en vez de
 * resetear todo. No es un <a> porque vive DENTRO del <Link> que cubre toda
 * la card del proyecto (un <a> anidado en otro <a> es HTML inválido) — por
 * eso navega con router.push y frena la propagación para no disparar
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
