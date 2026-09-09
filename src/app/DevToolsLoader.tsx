"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    __lensSkInjected?: boolean;
  }
}

// Lens-SK (toolbar de inspección visual) solo en desarrollo. Los archivos que
// carga viven en public/dev-tools/, generados por scripts/dev-tools-sync.js
// (predev los copia, prebuild los borra) — nunca quedan en el bundle de
// producción aunque este componente se renderice ahí.
export function DevToolsLoader() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (window.__lensSkInjected) return;
    window.__lensSkInjected = true;

    function loadScript(src: string) {
      return new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = () => resolve();
        s.onerror = reject;
        document.body.appendChild(s);
      });
    }

    loadScript("/dev-tools/modern-screenshot.umd.js")
      .then(() => loadScript("/dev-tools/toolbar.js"))
      .catch(() => {});
  }, []);

  return null;
}
