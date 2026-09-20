"use client";

import { useEffect, useState } from "react";

// Identidad del visitante externo sin cuenta (punto 16 confirmado con el
// usuario) — se pide una sola vez (nombre + cargo opcional) y se guarda en
// ESTE navegador para no volver a pedirla. Compartido entre PublicCommentThread
// y el panel de Aceptación (ambos identifican al cliente de la misma forma).
const IDENTITY_KEY = "pmsk-share-identity";

export type ShareIdentity = { name: string; role: string };

export function loadShareIdentity(): ShareIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Todos los hilos de la página (uno por ajuste) comparten la misma identidad
// en vivo: al identificarse en uno, los demás la toman sin recargar.
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function useShareIdentity() {
  const [identity, setIdentity] = useState<ShareIdentity | null>(null);
  useEffect(() => {
    const sync = () => setIdentity(loadShareIdentity());
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return identity;
}

export function clearShareIdentity() {
  try {
    localStorage.removeItem(IDENTITY_KEY);
  } catch {}
  notify();
}

export function saveShareIdentity(identity: ShareIdentity) {
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    // localStorage puede fallar (ventana privada, storage bloqueado) — la
    // identidad simplemente se vuelve a pedir la próxima vez, no es crítico.
  }
  notify();
}
