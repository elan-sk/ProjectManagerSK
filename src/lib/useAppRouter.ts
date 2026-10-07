"use client";

import { useMemo } from "react";
import { useRouter as useNextRouter } from "next/navigation";

// Aviso global de "empezó una navegación" para el indicador de carga (NavigationProgress). Next no
// expone un evento así y cada componente recibe su propia copia del router, por eso las navegaciones
// por código pasan por este useRouter (mismo uso que el de next/navigation).
export const NAVIGATION_START_EVENT = "pmsk:navigation-start";

export function startNavigationProgress(href: string) {
  try {
    const next = new URL(href, window.location.href);
    if (next.origin !== window.location.origin) return;
    if (next.pathname + next.search === window.location.pathname + window.location.search) return;
    window.dispatchEvent(new Event(NAVIGATION_START_EVENT));
  } catch {
    // dirección inválida: Next la rechazará igual; no hay nada que mostrar
  }
}

/** useRouter de Next con push/replace que encienden el indicador de carga. */
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
