"use client";

import { useEffect, useRef, useState } from "react";

// Agrupa todos los filtros (Buscar/Persona/Estado/Tipo/Alerta/Fechas/Colisión…) detrás de un
// botón "Filtros" en mobile (< lg) — apilados uno por uno se comían media pantalla. De lg en
// adelante se ven todos en fila como siempre, el botón desaparece.
export function MobileFiltersToggle({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="mb-3 text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 lg:hidden"
      >
        {open ? "Ocultar filtros" : "Filtros"}
      </button>
      <div className={`${open ? "mt-3 flex" : "hidden"} flex-col gap-3 lg:mt-0 lg:flex lg:flex-row lg:flex-wrap lg:items-start lg:gap-x-5 lg:gap-y-3`}>
        {children}
      </div>
    </div>
  );
}
