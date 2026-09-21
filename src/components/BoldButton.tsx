"use client";

import type { KeyboardEvent, RefObject } from "react";

type Field = HTMLInputElement | HTMLTextAreaElement;

// Pone o quita los asteriscos (*texto*) alrededor de la selección; la app ya
// muestra `*texto*` en negrita (ver lib/linkify). Sin selección deja `**` con
// el cursor en medio. Escribe con el setter nativo + evento "input" para que
// funcione igual en campos controlados de React y en formularios sin estado.
export function toggleBold(el: Field) {
  const v = el.value;
  const s = el.selectionStart ?? v.length;
  const e = el.selectionEnd ?? s;
  const sel = v.slice(s, e);
  let next: string;
  let a: number;
  let b: number;
  if (s > 0 && v[s - 1] === "*" && v[e] === "*" && s !== e) {
    next = v.slice(0, s - 1) + sel + v.slice(e + 1);
    a = s - 1;
    b = e - 1;
  } else if (/^\*[^*\n]+\*$/.test(sel)) {
    next = v.slice(0, s) + sel.slice(1, -1) + v.slice(e);
    a = s;
    b = e - 2;
  } else {
    // La negrita no cruza saltos de línea: cada renglón seleccionado se resalta por separado.
    const wrapped = sel.split("\n").map((l) => (l.trim() ? `*${l}*` : l)).join("\n");
    next = v.slice(0, s) + wrapped + v.slice(e);
    a = s === e ? s + 1 : s;
    b = s === e ? s + 1 : s + wrapped.length;
    if (s === e) next = v.slice(0, s) + "**" + v.slice(e);
  }
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, next);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.focus();
  el.setSelectionRange(a, b);
}

/** Atajo Ctrl+B (⌘+B en Mac) para el onKeyDown del campo. Devuelve true si lo atendió. */
export function boldOnKeyDown(e: KeyboardEvent<Field>) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
    e.preventDefault();
    toggleBold(e.currentTarget);
    return true;
  }
  return false;
}

/** Botón «B»: aplica la negrita a lo seleccionado en el campo de `targetRef`. */
export function BoldButton({ targetRef, className }: { targetRef: RefObject<Field | null>; className?: string }) {
  return (
    <button
      type="button"
      // mouseDown evita que el campo pierda la selección antes de aplicar la negrita.
      onMouseDown={(e) => {
        e.preventDefault();
        if (targetRef.current) toggleBold(targetRef.current);
      }}
      title="Negrita (Ctrl+B)"
      aria-label="Negrita"
      className={className ?? "cursor-pointer rounded px-1.5 py-0.5 text-sm font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700"}
    >
      B
    </button>
  );
}
