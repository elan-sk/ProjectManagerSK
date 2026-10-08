"use client";

import { useMemo } from "react";
import { useRouter as useNextRouter } from "next/navigation";
import { beginActivity, navigationLabel } from "@/lib/activityStatus";

// Las navegaciones avisan a la barra de estado inferior (NavigationProgress) qué están haciendo
// («Abriendo la tarea…», «Aplicando filtros»…). Next no expone un evento así y cada componente recibe
// su propia copia del router, por eso las navegaciones por código pasan por este useRouter (mismo uso
// que el de next/navigation). La actividad "nav" la cierra la barra cuando cambia la URL.
export const NAVIGATION_ACTIVITY_ID = "nav";

export function startNavigationProgress(href: string, linkText?: string | null) {
  try {
    const next = new URL(href, window.location.href);
    if (next.origin !== window.location.origin) return;
    if (next.pathname + next.search === window.location.pathname + window.location.search) return;
    beginActivity(navigationLabel(next.href, window.location.href, linkText), NAVIGATION_ACTIVITY_ID);
  } catch {
    // dirección inválida: Next la rechazará igual; no hay nada que mostrar
  }
}

/** useRouter de Next con push/replace que avisan a la barra de estado. */
export function useRouter() {
  const router = useNextRouter();
  return useMemo(
    () => ({
      ...router,
      push: (href: string, options?: Parameters<typeof router.push>[1]) => {
        startNavigationProgress(href);
        return router.push(href, options);
      },
      replace: (href: string, options?: Parameters<typeof router.replace>[1]) => {
        startNavigationProgress(href);
        return router.replace(href, options);
      },
    }),
    [router]
  );
}
