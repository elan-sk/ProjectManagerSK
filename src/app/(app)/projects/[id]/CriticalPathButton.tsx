"use client";

// Botón para resaltar la ruta crítica sin depender de encontrar y clickear
// a mano una de sus flechas dentro del Gantt (que es como funciona hoy). No
// hay estado compartido entre este botón (fuera del árbol de GanttView) y el
// propio GanttView — en vez de levantar el estado o pasar refs a través del
// Server Component que los separa, se avisan con un evento de window; ver el
// listener en GanttView.tsx.
export const CRITICAL_PATH_EVENT = "gantt-select-critical-path";

// Fucsia (bg-fuchsia-50/text-fuchsia-700), no gris: mismo lenguaje de color
// que ya usa la ruta crítica adentro del Gantt (outline y flechas en
// #c026d3) — así el botón se identifica de un vistazo con lo que va a
// resaltar. Rojo queda reservado para la línea de cierre del proyecto.
export function CriticalPathButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(CRITICAL_PATH_EVENT))}
      className="flex items-center gap-1.5 rounded-lg bg-fuchsia-50 px-3 py-1.5 text-sm font-medium text-fuchsia-700 hover:bg-fuchsia-100"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 flex-shrink-0">
        <path d="M11 2 4 12h5l-1 6 7-10h-5l1-6Z" />
      </svg>
      Ruta crítica
    </button>
  );
}
