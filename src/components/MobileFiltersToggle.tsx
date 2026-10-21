"use client";

import { useEffect, useRef, useState } from "react";
import { FILTER_BAR } from "@/lib/filterLayout";

// Agrupa todos los filtros (Buscar/Persona/Estado/Tipo/Alerta/Fechas/Colisión…) detrás de un
// botón "Filtros" en celular (< sm) — apilados uno por uno se comían media pantalla. De sm en
// adelante se ven siempre: en tablet en una fila con scroll horizontal (FILTER_BAR).
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
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 sm:hidden"
      >
        {open ? "Ocultar filtros" : "Filtros"}
      </button>
      <div className={`${open ? "mt-3" : "max-sm:hidden"} ${FILTER_BAR} sm:mt-0`}>
        {children}
      </div>
    </div>
  );
}
