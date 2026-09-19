"use client";

import { useEffect, type RefObject } from "react";
import { chooseTarget, pastedImageName, pickPastedImage, shouldHandlePaste } from "@/lib/pasteImage";

// Pegar una captura (Ctrl+V / Cmd+V) en cualquier área de subida. Cada área
// registra su <input type="file"> oculto; un único listener global recoge el
// pegado y le entrega la imagen al input elegido asignándole el archivo y
// disparando un `change` — así corre el MISMO camino que ya usa el botón
// «Subir» de esa área (validación, subida y refresco incluidos), sin tocar
// cada componente.
const registry = new Set<RefObject<HTMLInputElement | null>>();

// El "área" de un input: el contenedor con borde más cercano (la tarjeta), o
// uno marcado a mano con data-paste-zone. Es contra lo que se mide el mouse.
function zoneOf(input: HTMLInputElement): HTMLElement {
  return (input.closest("[data-paste-zone]") ??
    input.closest(".rounded-xl, .rounded-2xl, section, li, form") ??
    input.parentElement ??
    input) as HTMLElement;
}

// Áreas (inputs) que hoy pueden recibir una captura, con su zona, si el mouse
// está encima / el foco adentro, y su tamaño.
function candidates() {
  return [...registry]
    .map((r) => r.current)
    .filter((i): i is HTMLInputElement => !!i && i.isConnected && !i.disabled)
    .map((input) => {
      const zone = zoneOf(input);
      const rect = zone.getBoundingClientRect();
      return { id: input, hovered: zone.matches(":hover, :focus-within"), area: rect.width * rect.height };
    });
}

// Indicador visual: la zona que recibiría la captura lleva data-paste-active
// (ver globals.css: contorno + "Ctrl+V para pegar aquí"). Solo por mouse/foco.
let activeZone: HTMLElement | null = null;
let frame = 0;
function refreshIndicator() {
  frame = 0;
  const target = chooseTarget(candidates(), false);
  const zone = target ? zoneOf(target) : null;
  if (zone === activeZone) return;
  activeZone?.removeAttribute("data-paste-active");
  zone?.setAttribute("data-paste-active", "true");
  activeZone = zone;
}
function scheduleRefresh() {
  if (!frame) frame = requestAnimationFrame(refreshIndicator);
}

function onPaste(e: ClipboardEvent) {
  // Otro manejador ya lo atendió (ej. la caja de comentarios): no lo tocamos.
  if (e.defaultPrevented) return;
  const data = e.clipboardData;
  if (!data) return;
  const image = pickPastedImage(Array.from(data.files));
  if (!image) return; // sin imagen: pegado normal de texto, no se toca

  const t = e.target as HTMLElement | null;
  const editable = !!t && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA");
  const hasText = data.types.includes("text/plain") || data.types.includes("text/html");
  if (!shouldHandlePaste(true, editable, hasText)) return;

  const target = chooseTarget(candidates());
  if (!target) return;

  e.preventDefault();
  const file = new File([image], pastedImageName(image.type), { type: image.type });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  target.files = transfer.files;
  target.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Registra el input de un área de subida para que reciba capturas pegadas. */
export function usePasteImage(inputRef: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    registry.add(inputRef);
    if (registry.size === 1) {
      document.addEventListener("paste", onPaste);
      document.addEventListener("pointermove", scheduleRefresh, { passive: true });
      document.addEventListener("focusin", scheduleRefresh);
      document.addEventListener("focusout", scheduleRefresh);
    }
    return () => {
      registry.delete(inputRef);
      if (registry.size === 0) {
        document.removeEventListener("paste", onPaste);
        document.removeEventListener("pointermove", scheduleRefresh);
        document.removeEventListener("focusin", scheduleRefresh);
        document.removeEventListener("focusout", scheduleRefresh);
        activeZone?.removeAttribute("data-paste-active");
        activeZone = null;
      }
    };
  }, [inputRef]);
}
