"use client";

import { useEffect } from "react";
import Link from "next/link";

// Red de seguridad: cualquier error inesperado (de una pantalla o de una acción) se
// muestra acá con la opción de reintentar, en vez de la pantalla genérica que deja
// la aplicación bloqueada. El código sirve para encontrar el error en el registro.
export default function ErrorScreen({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto my-16 max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">No se pudo completar esta acción</h2>
      <p className="mt-2 text-sm text-slate-600">Ocurrió un problema inesperado. Se puede reintentar; si se repite, conviene avisar al administrador.</p>
      <div className="mt-5 flex justify-center gap-2">
        <button type="button" onClick={() => retry()} className="cursor-pointer rounded-lg bg-[#0a6b78] px-4 py-2 text-sm font-medium text-white hover:bg-[#085a65]">
          Reintentar
        </button>
        <Link href="/" className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
          Ir al inicio
        </Link>
      </div>
      {error.digest && <p className="mt-4 text-xs text-slate-400">Código para soporte: {error.digest}</p>}
    </div>
  );
}
