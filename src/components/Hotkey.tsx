"use client";

import { useEffect } from "react";

/**
 * Atajo Ctrl/Cmd + letra fuera de campos de texto (ahí Ctrl+B es negrita, ver
 * layout.tsx y BoldButton) y sin Shift/Alt. Si otro manejador ya lo atendió, no aplica.
 */
export function isAppShortcut(e: KeyboardEvent, key: string) {
  if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== key) return false;
  const t = e.target;
  return !(t instanceof HTMLElement && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT"));
}

/**
 * Insignia con la combinación del atajo (y su acción en `label`, cuando varias
 * quedan juntas). Oculta por defecto; aparece al pasar el mouse por un
 * ancestro con `group`, o en toda la app mientras se mantiene Ctrl
 * (`html.show-hotkeys`, ver HotkeyHints). Estilos en globals.css (.hotkey).
 */
export function Hotkey({ keys, label, className = "" }: { keys: string; label?: string; className?: string }) {
  return (
    <kbd className={`hotkey ${className}`}>
      Ctrl + {keys}
      {label && <span className="ml-1.5 font-normal text-white/75">{label}</span>}
    </kbd>
  );
}

/**
 * Mantener Ctrl (o Cmd) ~0,4 s revela todas las insignias, como Lens-SK con Shift.
 * La espera evita que parpadeen con cada Ctrl+C / Ctrl+V rápido.
 */
export function HotkeyHints() {
  useEffect(() => {
    const root = document.documentElement;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hide = () => {
      clearTimeout(timer);
      timer = undefined;
      root.classList.remove("show-hotkeys");
    };
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Control" || e.key === "Meta") {
        if (!timer && !root.classList.contains("show-hotkeys")) timer = setTimeout(() => root.classList.add("show-hotkeys"), 400);
      } else hide(); // se usó la combinación: no hace falta seguir mostrándolas
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "Control" || e.key === "Meta") hide();
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", hide);
    return () => {
      hide();
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", hide);
    };
  }, []);
  return null;
}
