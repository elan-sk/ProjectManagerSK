"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import "driver.js/dist/driver.css";
import { FEATURE_HINTS } from "@/lib/featureHints";
import { markFeatureHintSeen } from "@/app/(app)/featureHintActions";

const selector = (id: string) => `[data-feature-hint="${id}"]`;

/**
 * Muestra las novedades pendientes de la pantalla actual: oscurece el resto, resalta el elemento y
 * explica qué es (driver.js), hasta que la persona presiona «Entendido». Varias en la misma pantalla salen una tras otra. Si el elemento no está
 * a la vista (p. ej. menú cerrado en el celular) no se muestra ni se marca como vista.
 */
export function FeatureHints({ pending }: { pending: string[] }) {
  const pathname = usePathname();
  // Lo visto en esta sesión: el layout no se vuelve a pedir al navegar, así que `pending` queda viejo.
  const seen = useRef(new Set<string>());
  // Lo pendiente al cargar la app, fijo: LiveRefresh refresca el layout cada 12 s y eso nunca debe cerrar
  // un aviso abierto (se cerraba solo a los pocos segundos). Solo cambiar de pantalla lo cierra.
  const [initialPending] = useState(pending);

  useEffect(() => {
    const hints = FEATURE_HINTS.filter((h) => initialPending.includes(h.id) && !seen.current.has(h.id) && h.path === pathname);
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
        // Queda hasta que la persona presione «Entendido» (pedido del usuario): sin X, sin clic fuera ni Escape.
        showButtons: ["next"],
        allowClose: false,
        overlayClickBehavior: "none",
        allowKeyboardControl: false,
        nextBtnText: "Siguiente",
        doneBtnText: "Entendido",
        steps: visible.map((h) => ({
          element: selector(h.id),
          popover: {
            title: h.title,
            description: h.description,
            side: "bottom",
            align: "end",
            // Cuenta como vista recién al aceptarla: si la persona se va de la pantalla antes, la vuelve a ver.
            onNextClick: (_el, _step, { driver: tour }) => {
              if (!seen.current.has(h.id)) {
                seen.current.add(h.id);
                markFeatureHintSeen(h.id).catch(() => {});
              }
              if (tour.isLastStep()) tour.destroy();
              else tour.moveNext();
            },
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
  }, [pathname, initialPending]);

  return null;
}
