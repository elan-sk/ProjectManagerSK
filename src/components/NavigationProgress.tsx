"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ACTIVITY_EVENT, beginActivity, endActivity, isQuiet, type ActivityDetail } from "@/lib/activityStatus";
import { NAVIGATION_ACTIVITY_ID, startNavigationProgress } from "@/lib/useAppRouter";

// Barra de estado inferior, estilo VS Code (pedido del usuario): sube mientras la app trabaja y dice
// QUÉ está haciendo — «Abriendo la tarea "…"», «Aplicando filtros», «Procesando…», «Subiendo "x.pdf" ·
// 45 %» — y baja al terminar. No usa loading.tsx: en esta versión de Next ese fallback reemplaza la
// página entera también al cambiar un filtro y la pantalla parpadearía.
//
// Fuentes de actividad (src/lib/activityStatus.ts):
//  - clic en un link interno y router.push/replace de @/lib/useAppRouter → actividad "nav", que se
//    cierra cuando cambia la URL (si no cambia, a los SAFETY_MS);
//  - acciones del servidor (fetch con cabecera Next-Action) → «Procesando…» mientras esperan;
//  - subidas (uploadWithProgress) → «Subiendo "…"» con su porcentaje.

const MIN_VISIBLE_MS = 700; // aunque cargue al instante, se alcanza a ver la barra llenándose
const FINISH_MS = 250; // el relleno llega al 100 % antes de bajar
const SAFETY_MS = 15000;
const SHOW_ELAPSED_AFTER_S = 3;

type Activity = { id: string; label: string; progress?: number; startedAt: number };

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [visible, setVisible] = useState(false);
  // Relleno de la barra (0–1): sin avance real, sube rápido y se frena cerca del 90 %; al terminar va al 100 %.
  const [fill, setFill] = useState(0);
  const shownAt = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  const safety = useRef<number | null>(null);

  // Escucha el canal de actividades: altas, cambios de texto/avance y finales.
  useEffect(() => {
    function onActivity(e: Event) {
      const d = (e as CustomEvent<ActivityDetail>).detail;
      setActivities((list) => {
        if (d.done) return list.filter((a) => a.id !== d.id);
        const existing = list.find((a) => a.id === d.id);
        if (existing && d.id !== NAVIGATION_ACTIVITY_ID) {
          return list.map((a) => (a.id === d.id ? { ...a, label: d.label ?? a.label, progress: d.progress ?? a.progress } : a));
        }
        // Nueva (o una navegación nueva que reemplaza a la anterior): al final = la que se muestra.
        return [...list.filter((a) => a.id !== d.id), { id: d.id, label: d.label ?? "Cargando…", progress: d.progress, startedAt: Date.now() }];
      });
      if (d.id === NAVIGATION_ACTIVITY_ID && !d.done) {
        if (safety.current) window.clearTimeout(safety.current);
        safety.current = window.setTimeout(() => endActivity(NAVIGATION_ACTIVITY_ID), SAFETY_MS);
      }
    }
    window.addEventListener(ACTIVITY_EVENT, onActivity);
    return () => window.removeEventListener(ACTIVITY_EVENT, onActivity);
  }, []);

  // Cambió la URL: la navegación terminó.
  const url = `${pathname}?${searchParams.toString()}`;
  useEffect(() => {
    if (safety.current) window.clearTimeout(safety.current);
    endActivity(NAVIGATION_ACTIVITY_ID);
  }, [url]);

  // Mostrar al empezar (sin retardo), avanzar el relleno y, al terminar, completarlo y bajar respetando
  // el tiempo mínimo visible. Todo dentro de timers: nada de setState directo en el efecto.
  const busy = activities.length > 0;
  useEffect(() => {
    if (busy) {
      const timers = [
        window.setTimeout(() => {
          setVisible((v) => {
            if (!v) {
              shownAt.current = Date.now();
              setFill(0.08);
            }
            return true;
          });
        }, 0),
      ];
      const creep = window.setInterval(() => {
        setFill((f) => f + (0.9 - f) * 0.08);
        setNow(Date.now());
      }, 200);
      return () => {
        timers.forEach((t) => window.clearTimeout(t));
        window.clearInterval(creep);
      };
    }
    const wait = Math.max(FINISH_MS, MIN_VISIBLE_MS - (Date.now() - shownAt.current));
    const timers = [
      window.setTimeout(() => setFill((f) => (f > 0 ? 1 : 0)), 0),
      window.setTimeout(() => setVisible(false), wait),
      window.setTimeout(() => setFill(0), wait + 300),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [busy]);

  // Clic en un link interno (sin Ctrl/Cmd, sin pestaña nueva, sin descarga): su nombre va en el texto.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      startNavigationProgress(href, a.getAttribute("aria-label") || a.getAttribute("title") || a.textContent);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Acciones del servidor: todas viajan por fetch con la cabecera Next-Action.
  useEffect(() => watchServerActions(), []);

  const current = activities[activities.length - 1];
  const elapsed = current ? Math.floor((now - Math.min(...activities.map((a) => a.startedAt))) / 1000) : 0;
  const text = current ? `${current.label || "Cargando…"}${current.progress !== undefined ? ` · ${Math.round(current.progress * 100)} %` : ""}` : "";
  // Con avance real (subidas) manda ese avance; si no, el relleno simulado.
  const shownFill = current?.progress !== undefined ? Math.max(fill, current.progress) : fill;
  // El último texto queda visible mientras la barra baja (sin saltar a vacío).
  const [shownText, setShownText] = useState("");
  useEffect(() => {
    if (!text) return;
    const t = window.setTimeout(() => setShownText(text), 0);
    return () => window.clearTimeout(t);
  }, [text]);

  const extras = (
    <>
      {visible && activities.length > 1 && <span className="shrink-0 opacity-70">+{activities.length - 1} más</span>}
      {visible && elapsed >= SHOW_ELAPSED_AFTER_S && <span className="shrink-0 tabular-nums opacity-70">· {elapsed} s</span>}
    </>
  );
  const label = (
    <span className="flex h-full w-full items-center justify-center gap-2 px-4 text-xs font-semibold">
      <span className="min-w-0 truncate text-center">{shownText}</span>
      {extras}
    </span>
  );

  return (
    // Tres capas (pedido del usuario): fondo claro abajo, encima la barra que se carga a toda la altura (verde,
    // como el avance de los proyectos) y
    // encima el texto. El texto va verde oscuro sobre lo claro y del color del fondo sobre lo cargado (efecto
    // calado; misma posición, la copia recortada al ancho del relleno), así se lee en todo momento. Todo el ancho de la pantalla.
    <div
      role="status"
      aria-live="polite"
      aria-hidden={!visible}
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-[60] border-t border-emerald-100 bg-done-50 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] transition-transform duration-200 ease-out ${visible ? "translate-y-0" : "translate-y-full"}`}
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="relative h-7 overflow-hidden">
        {/* 1. fondo claro (verde muy suave, el del contenedor) + texto verde oscuro */}
        <div className="absolute inset-0 text-emerald-800">{label}</div>
        {/* 2. barra que se carga: mismo degradado que el avance de los proyectos (progress-fill-emerald),
            estirado sobre el tramo cargado para que se note entero; 3. el mismo texto en blanco encima. */}
        <div className="progress-fill-emerald absolute inset-y-0 left-0 overflow-hidden transition-[width] duration-300 ease-out" style={{ width: `${Math.round(shownFill * 100)}%` }}>
          {/* Texto del mismo color que el fondo: se ve «calado», como si dejara ver el fondo a través de la barra. */}
          <div className="text-done-50 absolute inset-y-0 left-0 w-screen">{label}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Envuelve window.fetch una sola vez: una petición con cabecera Next-Action (acción del servidor:
 * guardar, eliminar, abrir una contraseña…) muestra «Procesando…» mientras espera.
 * ponytail: depende de que Next mande esa cabecera en las acciones (así es en esta versión); si
 * cambia, la barra solo deja de mostrar «Procesando…», nada se rompe.
 */
function watchServerActions() {
  const w = window as Window & { __pmskFetchWatched?: boolean };
  if (w.__pmskFetchWatched) return;
  w.__pmskFetchWatched = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has("next-action") || isQuiet()) return original(input, init);
    const activity = beginActivity("Procesando…");
    try {
      return await original(input, init);
    } finally {
      activity.end();
    }
  };
}
