"use client";

import { useEffect } from "react";

const MIN_GAP_MS = 60_000;

// Mide uso REAL de la app (no solo inicios de sesión): escucha interacciones
// de la persona (clic, tecla, scroll, toque) y, como mucho una vez por minuto,
// avisa al servidor. Un LiveRefresh o una pestaña abierta sola no cuentan.
export function ActivityPing() {
  useEffect(() => {
    let last = 0;
    const onInteract = () => {
      const now = Date.now();
      if (now - last < MIN_GAP_MS) return;
      last = now;
      fetch("/api/activity", { method: "POST", keepalive: true }).catch(() => {});
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, onInteract, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, onInteract));
  }, []);
  return null;
}
