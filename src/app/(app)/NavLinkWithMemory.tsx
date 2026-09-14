"use client";

import Link from "next/link";
import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

function subscribe() {
  return () => {};
}
function getServerSnapshot() {
  return "";
}

/**
 * Misma memoria que usa NavLinkWithMemory (guardada por RememberViewState),
 * pero para navegar PROGRAMÁTICAMENTE con router.push tras una acción async
 * (ej. eliminar algo) en vez de un <Link> estático — evita depender de
 * router.back()/el historial real del navegador (frágil: cualquier filtro o
 * refresh de por medio puede hacer que "atrás" no caiga en la vista
 * esperada). Devuelve la URL completa con los filtros recordados.
 */
export function hrefWithMemory(href: string, storageKey: string): string {
  try {
    const search = localStorage.getItem(storageKey) ?? "";
    return search ? `${href}?${search}` : href;
  } catch {
    return href;
  }
}

/** Link de nav que vuelve con los mismos filtros/modo que tenías la última vez (guardados por RememberViewState), en vez de resetear siempre. */
export function NavLinkWithMemory({
  href,
  storageKey,
  className,
  style,
  children,
}: {
  href: string;
  storageKey: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const search = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(storageKey) ?? "";
      } catch {
        return "";
      }
    },
    getServerSnapshot
  );

  return (
    <Link href={search ? `${href}?${search}` : href} className={className} style={style}>
      {children}
    </Link>
  );
}
