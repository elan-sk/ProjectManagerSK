"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Número que pasa del valor anterior al nuevo contando, en vez de saltar de
 * golpe cuando cambian los filtros (ej. los contadores de alertas de la Agenda).
 *
 * Arranca ya en el valor real: solo anima cuando el número cambia después, así
 * que la primera carga no muestra un conteo desde 0. Con «reducir movimiento»
 * activo, cambia de inmediato.
 */
export function AnimatedCount({ value, durationMs = 450, className }: { value: number; durationMs?: number; className?: string }) {
  const [shown, setShown] = useState(value);
  // Último valor pintado: si un cambio llega a mitad de la animación, la nueva
  // parte desde ahí y no desde el destino anterior.
  const shownRef = useRef(value);

  useEffect(() => {
    const from = shownRef.current;
    if (from === value) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      shownRef.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (value - from) * eased);
      shownRef.current = next;
      setShown(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  // tabular-nums: los dígitos no cambian de ancho mientras cuentan.
  return <span className={`tabular-nums ${className ?? ""}`}>{shown}</span>;
}
