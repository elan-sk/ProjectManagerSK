"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { NAVIGATION_START_EVENT, startNavigationProgress } from "@/lib/useAppRouter";

// Indicador global de "la app está trabajando" (pedido del usuario): barra fina animada arriba y,
// si la espera pasa de medio segundo, una pastilla «Cargando…». No usa loading.tsx a propósito: en
// esta versión de Next ese fallback reemplaza la página entera también al cambiar un filtro
// (searchParams), y la pantalla parpadearía con cada clic.
//
// Arranca con: clic en un link interno, o router.push/replace hecho con el useRouter de
// @/lib/useAppRouter (filtros, buscador, fechas…). Termina cuando cambia la URL; si no cambia, se
// apaga sola a los SAFETY_MS. Navegar por código con el useRouter de next/navigation no lo enciende.

const SHOW_PILL_AFTER_MS = 500;
const SAFETY_MS = 12000;

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);
  const [showPill, setShowPill] = useState(false);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  const start = useCallback(() => {
    clearTimers();
    setActive(true);
    timers.current.push(window.setTimeout(() => setShowPill(true), SHOW_PILL_AFTER_MS));
    timers.current.push(
      window.setTimeout(() => {
        setActive(false);
        setShowPill(false);
      }, SAFETY_MS)
    );
  }, [clearTimers]);

  // Cambió la URL: la navegación terminó.
  const url = `${pathname}?${searchParams.toString()}`;
  useEffect(() => {
    clearTimers();
    const t = window.setTimeout(() => {
      setActive(false);
      setShowPill(false);
    }, 0);
    return () => window.clearTimeout(t);
  }, [url, clearTimers]);

  // router.push / router.replace (useRouter de @/lib/useAppRouter).
  useEffect(() => {
    window.addEventListener(NAVIGATION_START_EVENT, start);
    return () => window.removeEventListener(NAVIGATION_START_EVENT, start);
  }, [start]);

  // Clic en un link interno (sin Ctrl/Cmd, sin pestaña nueva, sin descarga, a otra dirección).
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      startNavigationProgress(href);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [start]);

  useEffect(() => clearTimers, [clearTimers]);

  return (
    <>
      <div
        aria-hidden
        className={`pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden transition-opacity duration-300 ${active ? "opacity-100" : "opacity-0"}`}
      >
        {active && <div className="nav-progress-bar progress-fill-teal h-full w-1/3 rounded-r-full" />}
      </div>
      {showPill && (
        <div
          role="status"
          aria-live="polite"
          className="nav-progress-pill pointer-events-none fixed top-3 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/95 px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-[0_4px_16px_rgba(15,23,42,0.15)] ring-1 ring-slate-200"
        >
          <span className="nav-progress-spinner h-3.5 w-3.5 rounded-full border-2 border-[#0a6b78]/25 border-t-[#0a6b78]" aria-hidden />
          Cargando…
        </div>
      )}
    </>
  );
}
