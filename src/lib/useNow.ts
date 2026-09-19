"use client";

import { useSyncExternalStore } from "react";

// Reloj compartido: un solo intervalo de 1 s para todos los componentes que lo
// usan, y solo mientras haya alguno montado. En el servidor devuelve 0 (así
// lo que dependa de la hora no se dibuja en el HTML del servidor y no hay
// diferencia con lo que calcula el navegador al hidratar).
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let snapshot = 0;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    snapshot = Date.now();
    timer = setInterval(() => {
      snapshot = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => snapshot || (snapshot = Date.now());
const getServerSnapshot = () => 0;

/** Hora actual en ms, actualizada cada segundo (0 durante el render del servidor). */
export function useNow() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
