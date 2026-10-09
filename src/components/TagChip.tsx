"use client";

import type { MouseEvent } from "react";
import { useRouter } from "@/lib/useAppRouter";
import { categoryFilterValue } from "@/lib/tagFilter";

// Punto 17: la etiqueta siempre se ve igual en cualquier lado de la app —
// color/emoji de la categoría + el nombre puntual (ej. 🧩 hero-banner). El
// color es un hex arbitrario de la paleta de proyectos, no una clase de
// Tailwind fija, así que el tinte de fondo se arma en línea (mismo hex con
// alfa bajo) en vez de mapear cada hex a una clase.
// Formato «Categoría | etiqueta» (pedido del usuario): la categoría en tono
// suave, una barra fina y la etiqueta en negrita. Sin nombre de etiqueta,
// solo la categoría.
export function TagChip({
  colorHex,
  emoji,
  categoryName,
  name,
  onRemove,
  filter,
}: {
  colorHex: string;
  emoji?: string | null;
  categoryName: string;
  name: string;
  onRemove?: () => void;
  /**
   * En las tarjetas de las vistas con filtro «Etiqueta»: clic en la categoría filtra por toda la categoría
   * y clic en el nombre filtra por esa etiqueta puntual (mismo valor que el ComboFilter, `?tag=`).
   */
  filter?: { tagId: string; categoryId: string };
}) {
  const router = useRouter();
  const fullLabel = name ? `${categoryName} | ${name}` : categoryName;
  // Dentro de una tarjeta (arrastrable y con link a la tarea): el clic solo filtra.
  const filterBy = (value: string) => (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const params = new URLSearchParams(window.location.search);
    params.set("tag", value);
    router.push(`${window.location.pathname}?${params.toString()}`, { scroll: false });
  };
  const part = (value: string, title: string, className: string, children: React.ReactNode) =>
    filter ? (
      <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={filterBy(value)} title={title} className={`${className} cursor-pointer hover:underline`}>
        {children}
      </button>
    ) : (
      <span className={className}>{children}</span>
    );
  return (
    <span
      title={fullLabel}
      className="inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: `${colorHex}1f`, color: colorHex }}
    >
      {emoji ? <span aria-hidden>{emoji}</span> : <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: colorHex }} aria-hidden />}
      {filter
        ? part(categoryFilterValue(filter.categoryId), `Filtrar por la categoría ${categoryName}`, name ? "flex-shrink-0 opacity-80" : "truncate", categoryName)
        : <span className={name ? "flex-shrink-0 opacity-80" : "truncate"}>{categoryName}</span>}
      {name && (
        <>
          <span className="h-2.5 w-px flex-shrink-0 opacity-40" style={{ backgroundColor: colorHex }} aria-hidden />
          {part(filter?.tagId ?? "", `Filtrar por la etiqueta ${fullLabel}`, "truncate font-semibold", name)}
        </>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Quitar etiqueta ${fullLabel}`} className="flex-shrink-0 opacity-60 hover:opacity-100">
          ✕
        </button>
      )}
    </span>
  );
}
