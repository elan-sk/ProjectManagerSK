"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Número que se renueva cuando cambia (ej. los contadores de alertas de la Agenda):
 * el valor nuevo entra desde abajo con un leve desenfoque y se asienta, en vez de
 * contar uno por uno ni saltar de golpe.
 *
 * La animación es una clase CSS (`.count-roll-in`, globals.css) que se vuelve a
 * disparar al cambiar `key`. La primera carga no se anima. Con «reducir
 * movimiento» activo, la regla global de globals.css la deja en 0,01 ms.
 */
export function AnimatedCount({ value, className }: { value: number; className?: string }) {
  const prevRef = useRef(value);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (prevRef.current === value) return;
    prevRef.current = value;
    setRun((r) => r + 1);
  }, [value]);

  // tabular-nums: los dígitos no cambian de ancho al renovarse.
  return (
    <span key={run} className={`inline-block tabular-nums ${run ? "count-roll-in" : ""} ${className ?? ""}`}>
      {value}
    </span>
  );
}
