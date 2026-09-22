"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MenuIcon, XIcon } from "@/components/icons";

// El resto del header (nav, buscador, campanas, cuenta) vive siempre en el DOM — acá solo se
// esconde/muestra con CSS según el ancho. Debajo de lg (1024px) flota como panel blanco
// (pacific-mobile-menu, ver globals.css); de lg en adelante vuelve a la fila normal dentro del
// header oscuro. En md/tablet (768px) la fila completa (nav + buscador + campanas + cuenta) no
// entra en una sola línea y se salía del viewport — de ahí que el corte sea en lg y no en md.
export function MobileMenuToggle({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  // Cerrar al navegar sin useEffect (evita el render en cascada que marca el
  // lint): ver "Adjusting state when a prop changes" en la doc de React.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative flex min-w-0 flex-1 items-center justify-end lg:justify-between lg:gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
        aria-expanded={open}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 lg:hidden"
      >
        {open ? <XIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
      </button>
      <div
        className={`pacific-mobile-menu ${open ? "flex" : "hidden"} absolute inset-x-0 top-full z-10 max-h-[calc(100dvh-4rem)] flex-col items-stretch gap-4 overflow-y-auto border-t border-slate-200 bg-white p-4 shadow-lg lg:static lg:z-auto lg:flex lg:max-h-none lg:flex-1 lg:flex-row lg:items-center lg:justify-between lg:gap-3 lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none`}
      >
        {children}
      </div>
    </div>
  );
}
