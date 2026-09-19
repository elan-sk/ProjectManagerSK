import Link from "next/link";

/**
 * Botón compacto para volver a la vista sin filtros. Solo se pinta cuando hay
 * al menos un filtro activo (`count > 0`) y lleva un punto + contador para
 * que se note que lo que se ve está filtrado. `href` ya debe conservar lo que
 * NO es filtro (vista, modo de calendario, fecha ancla…).
 */
export function ResetFiltersButton({ href, count, aligned = true }: { href: string; count: number; /** false cuando los demás filtros no tienen etiqueta encima. */ aligned?: boolean }) {
  if (count <= 0) return null;
  return (
    <div className="flex flex-col gap-1">
      {aligned && <span className="text-xs text-slate-400">&nbsp;</span>}
      <Link
        href={href}
        scroll={false}
        title="Quitar filtros"
        aria-label={`Quitar ${count} filtro${count !== 1 ? "s" : ""} activo${count !== 1 ? "s" : ""}`}
        // Baya sólido (#a3455f, de la paleta de la marca) a propósito: ningún
        // otro filtro usa ese tono (los demás son teal, gris o colores de
        // estado), así el botón de "quitar filtros" salta a la vista.
        className="relative flex items-center gap-1.5 rounded-lg bg-[#a3455f] px-2.5 py-1.5 text-white shadow-sm hover:bg-[#8f3b53]"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h18l-7 8.5V20l-4-2v-4.5L3 5z" />
          <path strokeLinecap="round" d="M17 3l4 4M21 3l-4 4" />
        </svg>
        <span className="text-xs font-semibold">{count}</span>
        <span aria-hidden className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-[#e5c979] ring-2 ring-white" />
      </Link>
    </div>
  );
}
