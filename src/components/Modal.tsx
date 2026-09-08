"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// Los formularios que viven dentro del modal se renderizan como children
// desde Server Components (la página del proyecto, settings, etc.), así que
// no pueden recibir la función "cerrar" como prop (una función no es
// serializable de servidor a cliente) — la toman de este contexto en su
// lugar, ya del lado del cliente.
const ModalCloseContext = createContext<() => void>(() => {});
export const useModalClose = () => useContext(ModalCloseContext);

/**
 * Botón + modal genérico: mantiene formularios de creación fuera de la
 * vista principal (punto 5) para no generar ruido visual permanente.
 */
export function ModalTrigger({
  label,
  title,
  children,
  variant = "primary",
  compact = false,
}: {
  label: string;
  title: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        onPointerDown={(e) => e.stopPropagation()}
        className={
          compact
            ? "text-xs font-medium text-slate-400 hover:text-slate-900"
            : variant === "primary"
            ? "rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800"
            : "rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        }
      >
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          // El modal puede quedar anidado dentro de un elemento arrastrable
          // (ej. una card del tablero Kanban) — aunque se vea como overlay de
          // pantalla completa, en el DOM sigue siendo su descendiente, así
          // que sin esto dnd-kit interpreta cualquier click adentro (un
          // checkbox, "Guardar") como el inicio de un arrastre.
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.18)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">{title}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Cerrar"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <ModalCloseContext.Provider value={close}>{children}</ModalCloseContext.Provider>
          </div>
        </div>
      )}
    </>
  );
}
