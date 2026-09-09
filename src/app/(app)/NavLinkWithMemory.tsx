"use client";

import Link from "next/link";
import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

function subscribe() {
  return () => {};
}
function getServerSnapshot() {
  return "";
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
