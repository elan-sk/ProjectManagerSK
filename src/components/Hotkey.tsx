"use client";

import { useEffect } from "react";

/**
 * Atajo Alt + tecla (sin Ctrl/Cmd/Shift), también escribiendo en un campo: no choca con la edición
 * de texto. `code` es la tecla física («KeyC»), porque en Mac Alt+letra escribe otro carácter.
 * AltGr vale igual que Alt: en Linux y Mac no marca `altKey`, y en Windows llega como Ctrl+Alt.
 * Si otro manejador ya lo atendió, no aplica.
 */
export function isAltShortcut(e: KeyboardEvent, code: string) {
  const alt = e.getModifierState("AltGraph") || (e.altKey && !e.ctrlKey);
  return !e.defaultPrevented && alt && !e.metaKey && !e.shiftKey && e.code === code;
}

const isHintKey = (e: KeyboardEvent) => e.key === "Control" || e.key === "Meta" || e.key === "Alt" || e.key === "AltGraph";

/**
 * Insignia con la combinación del atajo (y su acción en `label`, cuando varias
 * quedan juntas). Oculta por defecto; aparece al pasar el mouse por un
 * ancestro con `group`, o en toda la app mientras se mantiene Ctrl
 * (`html.show-hotkeys`, ver HotkeyHints). Estilos en globals.css (.hotkey).
 */
export function Hotkey({ keys, label, mod = "Ctrl", className = "" }: { keys: string; label?: string; mod?: "Ctrl" | "Alt"; className?: string }) {
  return (
    <kbd className={`hotkey ${className}`}>
      {mod} + {keys}
      {label && <span className="ml-1.5 font-normal text-white/75">{label}</span>}
    </kbd>
  );
}

/**
 * Mantener Ctrl, Cmd, Alt o AltGr ~0,4 s revela todas las insignias, como Lens-SK con Shift.
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
      if (isHintKey(e)) {
        if (!timer && !root.classList.contains("show-hotkeys")) timer = setTimeout(() => root.classList.add("show-hotkeys"), 400);
      } else hide(); // se usó la combinación: no hace falta seguir mostrándolas
    }
    function onKeyUp(e: KeyboardEvent) {
      if (isHintKey(e)) hide();
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
