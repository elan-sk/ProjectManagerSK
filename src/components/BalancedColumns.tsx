"use client";

import { Children, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Columnas que usan todo el ancho y terminan todas a ras (pedido del usuario en
 * Configuración): entran tantas columnas como quepan de `minColumnWidth`, cada
 * tarjeta va a la columna más corta en ese momento (en orden, según su altura
 * real) y la última de cada columna se estira hasta el borde de abajo.
 * Se recalcula al cambiar el ancho. Pasar de una columna a otra vuelve a montar
 * la tarjeta (solo pasa al redimensionar la ventana).
 */
export function BalancedColumns({ children, minColumnWidth = 416, gap = 16 }: { children: React.ReactNode; minColumnWidth?: number; gap?: number }) {
  const items = Children.toArray(children);
  const count = items.length;
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lastWidth = useRef(0);
  const [cols, setCols] = useState(1);
  const [columns, setColumns] = useState<number[][]>(() => [Array.from({ length: count }, (_, i) => i)]);
  // Mientras mide, nada se estira: así cada tarjeta muestra su altura natural.
  const [measuring, setMeasuring] = useState(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const width = el.clientWidth;
      if (width === lastWidth.current) return; // solo el ancho decide; los cambios de alto no relanzan el cálculo
      lastWidth.current = width;
      const n = Math.max(1, Math.min(count, Math.floor((width + gap) / (minColumnWidth + gap))));
      // Primero se acomodan ya en `n` columnas (de a una por turno) para medir cada tarjeta con su ancho real.
      setCols(n);
      setColumns(Array.from({ length: n }, (_, c) => Array.from({ length: count }, (_, i) => i).filter((i) => i % n === c)));
      setMeasuring(true);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [count, gap, minColumnWidth]);

  useLayoutEffect(() => {
    if (!measuring) return;
    const heights = Array.from({ length: count }, (_, i) => itemRefs.current[i]?.offsetHeight ?? 0);
    const next: number[][] = Array.from({ length: cols }, () => []);
    const filled = new Array(cols).fill(0);
    heights.forEach((h, i) => {
      const target = filled.indexOf(Math.min(...filled));
      next[target].push(i);
      filled[target] += h + gap;
    });
    // Medir y reacomodar antes de pintar es justamente lo que hace falta acá (no hay otra fuente para las alturas).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setColumns(next);
    setMeasuring(false);
  }, [measuring, cols, count, gap]);

  return (
    <div ref={containerRef} className="grid items-stretch" style={{ gap, gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
      {columns.map((col, c) => (
        <div key={c} className="flex flex-col" style={{ gap }}>
          {col.map((i, pos) => (
            <div
              key={i}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              className={`flex flex-col ${!measuring && pos === col.length - 1 ? "flex-1 [&>*:last-child]:flex-1" : ""}`}
              style={{ gap }}
            >
              {items[i]}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
