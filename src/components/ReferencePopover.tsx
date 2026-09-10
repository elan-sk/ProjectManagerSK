"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

export type ReferenceItem = { id: string; label: string; href: string };

const POPOVER_WIDTH = 256; // w-64

// Todo el interior usa spans con role+router.push (nunca <a>/<button> reales)
// a propósito: este componente se usa DENTRO de cards que ya son un <Link>
// entero (ver ProjectAlertLink, mismo motivo) — un <a>/<button> real anidado
// en otro <a> es HTML inválido y el navegador reordena el DOM para
// "arreglarlo", rompiendo el layout.
function InteractiveSpan({
  onActivate,
  className,
  title,
  role,
  children,
}: {
  onActivate: () => void;
  className?: string;
  title?: string;
  role: "button" | "link";
  children: React.ReactNode;
}) {
  return (
    <span
      role={role}
      tabIndex={0}
      title={title}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onActivate();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        e.stopPropagation();
        onActivate();
      }}
      className={`cursor-pointer ${className ?? ""}`}
    >
      {children}
    </span>
  );
}

/**
 * Envoltorio para cualquier badge/ícono que resuma datos de otras tareas
 * (colisiones, cuellos de botella, atrasos agregados, riesgo en cascada).
 * Hover = tooltip nativo informativo (barato, sin overlay propio). Click =
 * popup con la lista real de referencias, cada una linkeando directo a su
 * tarea — mismo patrón click+click-outside que NotificationBell.
 */
export function ReferencePopover({
  trigger,
  hoverText,
  items,
  filteredHref,
  filteredLabel = "Ver en el tablero filtrado",
  align = "left",
  className,
}: {
  trigger: React.ReactNode;
  hoverText?: string;
  items: ReferenceItem[];
  filteredHref?: string;
  filteredLabel?: string;
  align?: "left" | "right";
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    // El popover está portaleado a <body> (ver useLayoutEffect de abajo), así
    // que ya no se mueve solo con el scroll de un ancestro (ej. el panel del
    // Gantt, que scrollea internamente) — en vez de recalcular su posición en
    // cada scroll, lo cerramos.
    function handleScroll() {
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [open]);

  // Portaleado a <body> a propósito: el trigger suele vivir dentro de
  // columnas sticky (ej. la columna de tarea del Gantt) o de contenedores con
  // overflow propio, que crean su propio stacking/clipping context — un
  // popover absoluto ahí queda tapado por la fila siguiente o recortado por
  // el overflow del ancestro (bug real reportado: el popup de cuello de
  // botella quedaba por debajo de la fila de al lado). position:fixed +
  // portal lo saca de ese contexto por completo.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left =
      align === "right" || rect.left + POPOVER_WIDTH > window.innerWidth
        ? Math.max(8, rect.right - POPOVER_WIDTH)
        : rect.left;
    setPos({ top: rect.bottom + 4, left });
  }, [open, align]);

  if (items.length === 0) return <span title={hoverText}>{trigger}</span>;

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <span ref={containerRef} className="relative inline-flex">
      <InteractiveSpan
        role="button"
        title={hoverText}
        onActivate={() => setOpen((v) => !v)}
        className={`inline-flex items-center ${className ?? ""}`}
      >
        {trigger}
      </InteractiveSpan>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popoverRef}
            onClick={(e) => e.stopPropagation()}
            className="fixed z-50 w-64 rounded-xl bg-white p-2 text-left shadow-[0_4px_8px_rgba(15,23,42,0.08),0_16px_40px_rgba(15,23,42,0.12)]"
            style={{ top: pos.top, left: pos.left }}
          >
            {filteredHref && (
              <InteractiveSpan
                role="link"
                onActivate={() => go(filteredHref)}
                className="mb-1 block rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              >
                {filteredLabel}
              </InteractiveSpan>
            )}
            <ul className="max-h-56 space-y-0.5 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <InteractiveSpan
                    role="link"
                    onActivate={() => go(item.href)}
                    className="block truncate rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                  >
                    {item.label}
                  </InteractiveSpan>
                </li>
              ))}
            </ul>
          </div>,
          document.body
        )}
    </span>
  );
}
