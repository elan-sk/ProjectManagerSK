"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MenuIcon, XIcon } from "@/components/icons";
import { ANCHORED_POPOVER_ATTR } from "@/components/AnchoredPopover";

export function MobileMenuToggle({ children, search }: { children: React.ReactNode; search: React.ReactNode }) {
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
      if (e.target instanceof Element && e.target.closest(`[${ANCHORED_POPOVER_ATTR}]`)) return;
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative flex min-w-0 flex-1 items-center justify-end gap-1 lg:justify-between lg:gap-3">
      {search}
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
        className={`pacific-mobile-menu ${open ? "flex" : "hidden"} absolute right-0 top-full z-10 max-h-[calc(100dvh-4rem)] w-80 max-w-[calc(100vw-1rem)] flex-col items-stretch gap-3 overflow-x-hidden overflow-y-auto rounded-b-2xl border-t border-slate-200 bg-white p-3 shadow-lg lg:contents`}
      >
        {children}
      </div>
    </div>
  );
}
