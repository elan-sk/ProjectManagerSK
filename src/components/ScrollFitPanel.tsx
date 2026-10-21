"use client";

import { useEffect, type ReactNode } from "react";
import { holdPageAtBottom } from "@/lib/holdPageAtBottom";

// Envoltorio de vistas sin panel fijo (calendario): bajar dentro de ella con la
// rueda o el dedo lleva la página abajo del todo, como el tablero y el Gantt.
export function ScrollFitPanel({ children }: { children: ReactNode }) {
  useEffect(() => holdPageAtBottom({ holdUp: false }), []);
  return <div className="scroll-fit-panel">{children}</div>;
}
