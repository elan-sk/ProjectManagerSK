"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

type Position = { left: number; top: number; width: number; maxHeight: number };

export const ANCHORED_POPOVER_ATTR = "data-anchored-popover";

const MARGIN = 8;

export function useAnchoredPopover(width = 320) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Position | null>(null);
  const open = pos !== null;

  function close() {
    setPos(null);
  }

  function toggle() {
    if (pos) return setPos(null);
    const anchor = anchorRef.current;
    const rect = anchor?.getBoundingClientRect();
    if (!anchor || !rect) return;
    const panelWidth = Math.min(width, window.innerWidth - MARGIN * 2);
    const menu = window.innerWidth < 1024 ? anchor.closest(".pacific-mobile-menu") : null;
    const menuRect = menu?.getBoundingClientRect();
    const alignRight = menuRect ? menuRect.right : rect.right;
    const left = Math.min(Math.max(alignRight - panelWidth, MARGIN), window.innerWidth - panelWidth - MARGIN);
    const top = (menuRect ? menuRect.bottom : rect.bottom) + MARGIN;
    setPos({ left, top, width: panelWidth, maxHeight: Math.max(window.innerHeight - top - MARGIN, 120) });
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      setPos(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setPos(null);
    }
    function onResize() {
      setPos(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return { anchorRef, panelRef, pos, toggle, close };
}

export function AnchoredPopover({ pos, panelRef, children }: { pos: Position | null; panelRef: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  if (!pos) return null;
  return createPortal(
    <div
      ref={panelRef}
      {...{ [ANCHORED_POPOVER_ATTR]: "" }}
      className="pacific-popover fixed z-[70] overflow-x-hidden overflow-y-auto rounded-2xl bg-white p-2 text-slate-700 shadow-[0_4px_8px_rgba(15,23,42,0.08),0_16px_40px_rgba(15,23,42,0.12)]"
      style={pos}
    >
      {children}
    </div>,
    document.body
  );
}

// Desplegable fijo pegado debajo de su botón (para usar con createPortal a body): así no lo
// recorta una fila con scroll horizontal, como los filtros en tablet. Sigue al botón si la
// página o la fila se desplazan.
export function useFixedBelow(anchorRef: RefObject<HTMLElement | null>, open: boolean, alignRight: boolean) {
  const [style, setStyle] = useState<CSSProperties | null>(null);
  useEffect(() => {
    if (!open) return;
    function place() {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setStyle({
        position: "fixed",
        top: rect.bottom + 4,
        minWidth: rect.width,
        ...(alignRight ? { right: Math.max(window.innerWidth - rect.right, MARGIN) } : { left: Math.max(rect.left, MARGIN) }),
      });
    }
    place();
    window.addEventListener("scroll", place, { capture: true, passive: true });
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, { capture: true });
      window.removeEventListener("resize", place);
      setStyle(null); // al reabrir no aparece un instante en la posición vieja
    };
  }, [anchorRef, open, alignRight]);
  return open ? style : null;
}
