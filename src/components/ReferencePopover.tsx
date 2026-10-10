"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "@/lib/useAppRouter";
import { ArrowLeftIcon } from "@/components/icons";

/** `content` (opcional): fila enriquecida en vez del texto (ej. subproyectos con ícono y avance). */
export type ReferenceItem = { id: string; label: string; href: string; content?: React.ReactNode };

const POPOVER_WIDTH = 256; // w-64 por defecto; `width` lo cambia

// Color del punto de cada fila: el de la alerta que abrió el popup; sin alerta, el teal de la app.
const TONE_DOT = {
  teal: "bg-[#0a6b78]",
  red: "bg-red-500",
  amber: "bg-amber-500",
  blue: "bg-blue-500",
} as const;
export type ReferenceTone = keyof typeof TONE_DOT;

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
  extraHref,
  extraLabel,
  align = "left",
  className,
  width = POPOVER_WIDTH,
  tone = "teal",
}: {
  trigger: React.ReactNode;
  hoverText?: string;
  items: ReferenceItem[];
  filteredHref?: string;
  filteredLabel?: string;
  /** Segundo link opcional, debajo de filteredHref (ej. detalle enriquecido de una colisión puntual). */
  extraHref?: string;
  extraLabel?: string;
  align?: "left" | "right";
  className?: string;
  width?: number;
  tone?: ReferenceTone;
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
      align === "right" || rect.left + width > window.innerWidth
        ? Math.max(8, rect.right - width)
        : rect.left;
    setPos({ top: rect.bottom + 4, left });
  }, [open, align, width]);

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
        className={`inline-flex items-center rounded transition-opacity hover:opacity-60 ${className ?? ""}`}
      >
        {trigger}
      </InteractiveSpan>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popoverRef}
            onClick={(e) => e.stopPropagation()}
            className="fixed z-[70] max-w-[calc(100vw-16px)] rounded-2xl bg-white p-1.5 text-left shadow-[0_4px_8px_rgba(15,23,42,0.08),0_16px_40px_rgba(15,23,42,0.12)] ring-1 ring-[color:var(--pacific-foam-pale)]"
            style={{ top: pos.top, left: pos.left, width }}
          >
            <ul className="max-h-56 space-y-0.5 overflow-x-hidden overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <InteractiveSpan
                    role="link"
                    title={item.content ? undefined : item.label}
                    onActivate={() => go(item.href)}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-900 hover:bg-slate-100 focus-visible:bg-slate-100"
                  >
                    {item.content ? (
                      <span className="min-w-0 flex-1">{item.content}</span>
                    ) : (
                      <>
                        <span className={`h-2 w-2 flex-shrink-0 rounded-full ${TONE_DOT[tone]}`} aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      </>
                    )}
                  </InteractiveSpan>
                </li>
              ))}
            </ul>
            {(filteredHref || extraHref) && (
              <div className="mt-1 border-t border-slate-100 pt-1">
                {[
                  { href: filteredHref, label: filteredLabel },
                  { href: extraHref, label: extraLabel },
                ].map(
                  ({ href, label }) =>
                    href && (
                      <InteractiveSpan
                        key={href}
                        role="link"
                        onActivate={() => go(href)}
                        className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[color:var(--pacific-tide)] hover:bg-[color:var(--pacific-foam)] focus-visible:bg-[color:var(--pacific-foam)]"
                      >
                        {label}
                        <ArrowLeftIcon className="h-3.5 w-3.5 flex-shrink-0 rotate-180" />
                      </InteractiveSpan>
                    ),
                )}
              </div>
            )}
          </div>,
          document.body
        )}
    </span>
  );
}
