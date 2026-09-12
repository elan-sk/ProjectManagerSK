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
 *
 * `limit` (vista "Recientes") se aplica DESPUÉS de ese reordenamiento: son
 * los proyectos realmente abiertos/manipulados hace poco, no los últimos
 * `limit` creados — si no aplicara acá sino en el servidor, un proyecto
 * viejo recién abierto nunca llegaría a mostrarse.
 */
export function ProjectCardsOrder({ items, limit }: { items: { id: string; node: ReactNode }[]; limit?: number }) {
  const [ordered, setOrdered] = useState(() => (limit ? items.slice(0, limit) : items));

  useEffect(() => {
    let sorted = items;
    try {
      const recent: string[] = JSON.parse(localStorage.getItem(RECENT_PROJECT_IDS_KEY) ?? "[]");
      if (recent.length > 0) {
        const rank = new Map(recent.map((id, i) => [id, i]));
        sorted = [...items].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
      }
    } catch {
      // localStorage no disponible (modo privado, etc.) — se queda con el orden del servidor
    }
    setOrdered(limit ? sorted.slice(0, limit) : sorted);
  }, [items, limit]);

  return (
    <>
      {ordered.map((item) => (
        <div key={item.id}>{item.node}</div>
      ))}
    </>
  );
}
