"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Punto 12 (tiempo real): no hay WebSockets/SSE en el proyecto — la forma
// más simple de que los cambios de otro usuario se vean sin recargar a mano
// es refrescar el payload del servidor cada tanto mientras la pestaña está
// visible. No es push real (hasta `intervalMs` de demora), pero combinado
// con el bloqueo optimista de actions.ts (assertNotStale) alcanza para
// "se ve, y no se pisa".
// ponytail: intervalo fijo, sin backoff ni coalescing entre vistas montadas
// a la vez — si esto genera carga notable con muchos usuarios concurrentes,
// ahí es donde conviene subir a un canal push real (SSE/WebSocket).
export function LiveRefresh({ intervalMs = 12000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
