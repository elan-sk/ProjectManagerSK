"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Health = { status: "disconnected" | "connecting" | "connected"; expected: boolean; needsQr: boolean; reason: string | null };

// Aviso del header (solo admin): aparece siempre que WhatsApp NO está conectado
// (caído, desvinculado, detenido a mano o sin vincular todavía). Consulta cada
// 30 s; si fue una caída, el servidor reintenta solo y el aviso desaparece.
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

  if (!health || health.status === "connected") return null;
  const detail = health.needsQr
    ? "Falta vincular WhatsApp escaneando el QR."
    : health.expected
      ? (health.reason ?? "Sin conexión; reintentando en segundo plano.")
      : "La conexión está detenida.";
  return (
    <Link
      href="/settings#whatsapp"
      title={`WhatsApp desconectado — ${detail}`}
      aria-label={`WhatsApp desconectado. ${detail}`}
      className="relative flex items-center gap-1 rounded-full bg-red-500/90 px-2 py-0.5 text-[11px] font-medium leading-4 text-white hover:bg-red-600"
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden />
      WhatsApp
    </Link>
  );
}
