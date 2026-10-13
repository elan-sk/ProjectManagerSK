"use client";

import { useEffect, useState } from "react";

/**
 * Barra de avance que se llena sola al aparecer y se ajusta con una transición
 * suave cuando el avance cambia (nunca salta de golpe).
 *
 * Por qué un componente: la barra la dibuja el servidor con su ancho final, así
 * que el navegador la pinta ya llena y no hay nada que animar. Acá arranca en 0
 * y pasa al valor real en el primer cuadro — la transición del CSS
 * (.progress-fill-*) hace el resto.
 *
 * Solo cubre el ancho; la pista y el degradado los pone quien la usa, para no
 * cambiar el aspecto de cada barra (colores, alturas y medidas son distintos).
 */
export function ProgressFill({
  pct,
  className,
  durationMs = 700,
}: {
  /** Avance 0–100. */
  pct: number;
  /** Clase de la familia de color, ej. «progress-fill-emerald» o «progress-fill-task». */
  className: string;
  /** Un poco menos para barras chicas (las de tarjeta), donde 700 ms se siente lento. */
  durationMs?: number;
}) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    // Doble cuadro: con uno solo el navegador todavía ve el ancho 0 y no anima.
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => setShown(pct)),
    );
    return () => cancelAnimationFrame(raf);
  }, [pct]);

  return (
    <span
      className={`${className} block h-full`}
      style={{ width: `${shown}%`, transitionDuration: `${durationMs}ms` }}
    />
  );
}
