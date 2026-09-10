"use client";

import { createContext, useCallback, useContext, useState } from "react";

type ConfirmOptions = { confirmLabel?: string; cancelLabel?: string; danger?: boolean };
type ConfirmState = ConfirmOptions & { message: string; resolve: (value: boolean) => void };

const ConfirmContext = createContext<((message: string, options?: ConfirmOptions) => Promise<boolean>) | null>(null);

/**
 * Reemplazo propio de window.confirm() — un diálogo nativo del navegador
 * corta el flujo visual de la página (bloquea el hilo, no se puede estilar).
 * Mismo patrón que ToastProvider: un solo diálogo compartido, resuelto
 * imperativamente con una Promise para poder seguir usando `await confirm(...)`.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((message: string, options: ConfirmOptions = {}) => {
    return new Promise<boolean>((resolve) => {
      setState({ message, resolve, ...options });
    });
  }, []);

  function respond(result: boolean) {
    state?.resolve(result);
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => respond(false)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.18)]">
            <p className="text-sm text-slate-700">{state.message}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => respond(false)}
                className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {state.cancelLabel ?? "Cancelar"}
              </button>
              <button
                type="button"
                onClick={() => respond(true)}
                className={`rounded-lg px-3.5 py-2 text-sm font-medium text-white ${
                  state.danger ? "bg-red-600 hover:bg-red-700" : "bg-slate-900 hover:bg-slate-800"
                }`}
              >
                {state.confirmLabel ?? "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm debe usarse dentro de ConfirmProvider");
  return confirm;
}
