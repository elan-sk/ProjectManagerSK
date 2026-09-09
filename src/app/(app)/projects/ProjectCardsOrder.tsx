"use client";

import { useEffect, useState, type ReactNode } from "react";
import { RECENT_PROJECT_IDS_KEY } from "./[id]/SaveLastProject";

/**
 * Reordena las tarjetas de proyecto por "último abierto primero" (pedido
 * explícito del usuario) usando el historial que guarda SaveLastProject en
 * localStorage — vive solo en el navegador, no en la base de datos, así que
 * el reordenamiento pasa acá en un Client Component en vez de en el
 * `orderBy` del query del Server Component. El orden inicial (el que ya
 * traía el servidor, createdAt desc) se mantiene para los proyectos que
 * nunca se visitaron — sort() es estable, así que solo se reacomodan los
 * visitados, al frente, sin desordenar el resto.
 */
export function ProjectCardsOrder({ items }: { items: { id: string; node: ReactNode }[] }) {
  const [ordered, setOrdered] = useState(items);

  useEffect(() => {
    try {
      const recent: string[] = JSON.parse(localStorage.getItem(RECENT_PROJECT_IDS_KEY) ?? "[]");
      if (recent.length === 0) return;
      const rank = new Map(recent.map((id, i) => [id, i]));
      setOrdered(
        [...items].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity))
      );
    } catch {
      // localStorage no disponible (modo privado, etc.) — se queda con el orden del servidor
    }
  }, [items]);

  return (
    <>
      {ordered.map((item) => (
        <div key={item.id}>{item.node}</div>
      ))}
    </>
  );
}
