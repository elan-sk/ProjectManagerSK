"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GANTT_TOOLTIP_LAYER_ID } from "./GanttBar";

/**
 * Línea vertical de "hoy" en el Gantt: al pasar el mouse muestra la fecha
 * (antes no daba ninguna info), y al hacer click se centra a sí misma en el
 * scroll horizontal — útil en cronogramas largos donde "hoy" puede quedar
 * fuera de vista después de scrollear. `prefix`/`colorClass` opcionales
 * reusan el mismo componente para otras líneas de fecha (ej. el deadline del
 * proyecto) sin duplicar la lógica de tooltip/scroll/portal.
 *
 * El tooltip se portalea (como en GanttBar) en vez de ser un hijo posicionado
 * `absolute` dentro de la propia fila: si "hoy" cae en la última fila del
 * Gantt, un tooltip hijo se desbordaría por debajo del contenedor con scroll
 * horizontal y le generaría un scroll vertical propio que no debe existir.
 */
export function TodayMarker({
  left,
  label,
  prefix = "Hoy",
  colorClass = "bg-amber-400 hover:bg-amber-500",
}: {
  left: number;
  label: string;
  prefix?: string;
  colorClass?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);

  function showTooltip() {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setTooltipPos({ left: rect.left, top: rect.bottom + 4 });
  }

  function hideTooltip() {
    setTooltipPos(null);
  }

  const tooltipLayer = typeof document !== "undefined" ? document.getElementById(GANTT_TOOLTIP_LAYER_ID) : null;

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={() => ref.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" })}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
      className={`absolute top-0 z-20 h-full w-px cursor-pointer outline-none hover:w-0.5 ${colorClass}`}
      style={{ left }}
    >
      {tooltipPos &&
        tooltipLayer &&
        createPortal(
          <div
            className="absolute -translate-x-1/2 whitespace-nowrap rounded-lg bg-white px-2 py-1 text-[11px] font-medium text-slate-700 shadow-[0_4px_8px_rgba(15,23,42,0.08),0_8px_20px_rgba(15,23,42,0.1)]"
            style={{ left: tooltipPos.left, top: tooltipPos.top }}
          >
            {prefix} · {label}
          </div>,
          tooltipLayer
        )}
    </div>
  );
}
