import Link from "next/link";

/**
 * Botón compacto para volver a la vista sin filtros. Solo se pinta cuando hay
 * al menos un filtro activo (`count > 0`) y lleva la cantidad en el círculo de la esquina para
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
          {/* X roja sobre el embudo (pedido del usuario), con un borde blanco por
              detrás para que no se pierda contra el fondo baya. */}
          <path stroke="#ffffff" strokeLinecap="round" strokeWidth={4.6} d="M16.5 2.5l5 5M21.5 2.5l-5 5" />
          <path stroke="#d10000" strokeLinecap="round" strokeWidth={2.6} d="M16.5 2.5l5 5M21.5 2.5l-5 5" />
        </svg>
        {/* Cantidad de filtros aplicados, como contador de notificación. */}
        <span
          aria-hidden
          className="absolute -top-2 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#e5c979] px-1 text-[10px] font-bold leading-none text-[#5c2233] ring-2 ring-white"
        >
          {count}
        </span>
      </Link>
    </div>
  );
}
