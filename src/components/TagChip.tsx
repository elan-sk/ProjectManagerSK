"use client";

import type { MouseEvent } from "react";
import { useRouter } from "@/lib/useAppRouter";
import { categoryFilterValue } from "@/lib/tagFilter";
import { openHeaderSearch, tagSearchQuery } from "@/lib/search";

// Punto 17: la etiqueta siempre se ve igual en cualquier lado de la app —
// color/emoji de la categoría + el nombre puntual (ej. 🧩 hero-banner). El
// color es un hex arbitrario de la paleta de proyectos, no una clase de
// Tailwind fija, así que el tinte de fondo se arma en línea (mismo hex con
// alfa bajo) en vez de mapear cada hex a una clase.
// Formato «Categoría | etiqueta» (pedido del usuario): la categoría en negrita,
// una barra fina y la etiqueta en tono suave. Sin nombre de etiqueta,
// solo la categoría.
export function TagChip({
  colorHex,
  emoji,
  categoryName,
  name,
  onRemove,
  filter,
  searchable,
  size = "sm",
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
  /**
   * En el detalle de la tarea: clic en la categoría abre el buscador del header con
   * «etiquetas:categoría:» y clic en el nombre con «etiquetas:categoría:etiqueta».
   */
  searchable?: boolean;
  /** `md`: más grande y con borde, para donde la etiqueta es protagonista (detalle y formulario de la tarea); `sm` en tarjetas. */
  size?: "sm" | "md";
}) {
  const md = size === "md";
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
  const searchBy = (query: string) => (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openHeaderSearch(query);
  };
  const part = (value: string, title: string, className: string, children: React.ReactNode, query?: string) =>
    filter || (searchable && query) ? (
      <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={filter ? filterBy(value) : searchBy(query!)} title={title} className={`${className} cursor-pointer hover:underline`}>
        {children}
      </button>
    ) : (
      <span className={className}>{children}</span>
    );
  return (
    <span
      title={fullLabel}
      className={`inline-flex max-w-full items-center rounded-full font-medium ${md ? "gap-1.5 px-3 py-1 text-sm" : "gap-1 px-2 py-0.5 text-[11px]"}`}
      style={{ backgroundColor: `${colorHex}${md ? "33" : "1f"}`, color: colorHex, boxShadow: md ? `inset 0 0 0 1.5px ${colorHex}99` : undefined }}
    >
      {emoji ? <span aria-hidden>{emoji}</span> : <span className={`flex-shrink-0 rounded-full ${md ? "h-2 w-2" : "h-1.5 w-1.5"}`} style={{ backgroundColor: colorHex }} aria-hidden />}
      {filter
        ? part(categoryFilterValue(filter.categoryId), `Filtrar por la categoría ${categoryName}`, name ? "flex-shrink-0 font-semibold" : "truncate font-semibold", categoryName)
        : searchable
          ? part("", `Buscar tareas con la categoría ${categoryName}`, name ? "flex-shrink-0 font-semibold" : "truncate font-semibold", categoryName, tagSearchQuery(categoryName))
          : <span className={name ? "flex-shrink-0 font-semibold" : "truncate font-semibold"}>{categoryName}</span>}
      {name && (
        <>
          <span className={`w-px flex-shrink-0 opacity-40 ${md ? "h-3.5" : "h-2.5"}`} style={{ backgroundColor: colorHex }} aria-hidden />
          {part(filter?.tagId ?? "", filter ? `Filtrar por la etiqueta ${fullLabel}` : `Buscar tareas con la etiqueta ${fullLabel}`, "truncate opacity-80", name, searchable ? tagSearchQuery(categoryName, name) : undefined)}
        </>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Quitar etiqueta ${fullLabel}`} className="flex-shrink-0 cursor-pointer opacity-60 hover:opacity-100">
          ✕
        </button>
      )}
    </span>
  );
}
