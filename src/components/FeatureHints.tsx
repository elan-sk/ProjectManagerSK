"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import "driver.js/dist/driver.css";
import { FEATURE_HINTS } from "@/lib/featureHints";
import { markFeatureHintSeen } from "@/app/(app)/featureHintActions";

const selector = (id: string) => `[data-feature-hint="${id}"]`;

/**
 * Muestra las novedades pendientes de la pantalla actual: oscurece el resto, resalta el elemento y
 * explica qué es (driver.js). Varias en la misma pantalla salen una tras otra. Si el elemento no está
 * a la vista (p. ej. menú cerrado en el celular) no se muestra ni se marca como vista.
 */
export function FeatureHints({ pending }: { pending: string[] }) {
  const pathname = usePathname();
  // Lo visto en esta sesión: el layout no se vuelve a pedir al navegar, así que `pending` queda viejo.
  const seen = useRef(new Set<string>());
  // Por valor: un router.refresh trae un arreglo nuevo con lo mismo y no debe reiniciar el resaltado.
  const pendingKey = pending.join(",");

  useEffect(() => {
    const hints = FEATURE_HINTS.filter((h) => pendingKey.split(",").includes(h.id) && !seen.current.has(h.id) && h.path === pathname);
    if (hints.length === 0) return;
    let cancelled = false;
    let tour: { destroy: () => void } | null = null;
    // Deja que la pantalla termine de dibujarse antes de buscar los elementos.
    const timer = setTimeout(async () => {
      const visible = hints.filter((h) => (document.querySelector(selector(h.id))?.getClientRects().length ?? 0) > 0);
      if (cancelled || visible.length === 0) return;
      const { driver } = await import("driver.js");
      if (cancelled) return;
      const d = driver({
        popoverClass: "feature-hint",
        overlayOpacity: 0.45,
        stagePadding: 6,
        stageRadius: 10,
        showButtons: ["next", "close"],
        nextBtnText: "Siguiente",
        doneBtnText: "Entendido",
        steps: visible.map((h) => ({
          element: selector(h.id),
          popover: { title: h.title, description: h.description, side: "bottom", align: "end" },
          onHighlighted: () => {
            if (seen.current.has(h.id)) return;
            seen.current.add(h.id);
            markFeatureHintSeen(h.id).catch(() => {});
          },
        })),
      });
      tour = d;
      d.drive();
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      tour?.destroy();
    };
  }, [pathname, pendingKey]);

  return null;
}
