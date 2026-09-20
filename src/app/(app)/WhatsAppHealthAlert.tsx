"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Health = { status: "disconnected" | "connecting" | "connected"; expected: boolean; needsQr: boolean; reason: string | null };

// Alarma del header (solo admin): aparece cuando el bot de WhatsApp debería
// estar conectado y no lo está. Consulta cada 30 s; el servidor ya reintenta
// solo en segundo plano, así que normalmente desaparece sola.
export function WhatsAppHealthAlert() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/whatsapp/health", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((h) => alive && setHealth(h))
        .catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!health || health.status === "connected" || !health.expected) return null;
  const detail = health.needsQr
    ? "Hay que volver a vincular WhatsApp escaneando el QR."
    : (health.reason ?? "Sin conexión; reintentando en segundo plano.");
  return (
    <Link
      href="/settings"
      title={`WhatsApp desconectado — ${detail}`}
      aria-label={`WhatsApp desconectado. ${detail}`}
      className="relative flex items-center gap-1.5 rounded-full bg-red-500/90 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-600"
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden />
      WhatsApp caído
    </Link>
  );
}
