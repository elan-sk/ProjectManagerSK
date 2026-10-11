"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Alto visible mientras está plegado. */
const COLLAPSED_HEIGHT = 240;
/** Solo se pliega si queda oculto al menos esto; evita un «Ver todo» por un par de líneas. */
const MIN_HIDDEN = 80;

/** Contenido que arranca plegado si es largo; si no supera el alto, no muestra ningún control. */
export function CollapsibleContent({ children }: { children: ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => setOverflows(el.offsetHeight > COLLAPSED_HEIGHT + MIN_HIDDEN);
    measure();
    // Las imágenes cargan después y cambian el alto.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const collapsed = overflows && !expanded;

  return (
    <div>
      <div
        className="relative overflow-x-hidden overflow-y-hidden"
        style={expanded ? undefined : { maxHeight: overflows ? COLLAPSED_HEIGHT : COLLAPSED_HEIGHT + MIN_HIDDEN }}
      >
        <div ref={innerRef}>{children}</div>
        {collapsed && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" />}
      </div>
      {overflows && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-base font-medium text-slate-500 hover:text-slate-800 hover:underline"
        >
          {expanded ? "Ver menos" : "Ver todo"}
        </button>
      )}
    </div>
  );
}
