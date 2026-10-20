"use client";

import { useEffect, useState } from "react";

// Salida segura en pantallas táctiles: con el tablero o el Gantt acomodados
// abajo del todo, un toque sube la página sin depender de acertar el gesto
// (ver holdPageAtBottom.ts). El CSS lo deja existir solo con uno de esos paneles.
export function ScrollTopHandle() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const update = () => setShown(window.scrollY > 120);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return (
    <button
      type="button"
      aria-label="Subir"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={`scroll-top-handle fixed bottom-4 left-4 z-40 h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-[#0a6b78] text-white shadow-lg transition-opacity hover:brightness-110 ${shown ? "opacity-90" : "pointer-events-none opacity-0"}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m18 15-6-6-6 6" />
      </svg>
    </button>
  );
}
