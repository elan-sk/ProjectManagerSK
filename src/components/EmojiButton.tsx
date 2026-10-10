"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { SmileIcon } from "@/components/icons";

const WIDTH = 320;
const HEIGHT = 460;

// La librería y los nombres en español (búsqueda: «corazón», «fuego», «risa»…) se descargan
// recién al abrir el selector por primera vez. Emojis nativos: sin imágenes desde internet.
const Picker = dynamic(
  async () => {
    const [{ default: EmojiPicker, EmojiStyle }, { default: es }] = await Promise.all([
      import("emoji-picker-react"),
      import("emoji-picker-react/dist/data/emojis-es.js"),
    ]);
    return function SpanishPicker({ onPick, height }: { onPick: (emoji: string) => void; height: number }) {
      return (
        <EmojiPicker
          emojiData={es}
          emojiStyle={EmojiStyle.NATIVE}
          searchPlaceholder="Buscar emoji…"
          previewConfig={{ showPreview: false }}
          lazyLoadEmojis
          width={WIDTH}
          height={height}
          onEmojiClick={(d) => onPick(d.emoji)}
        />
      );
    };
  },
  {
    ssr: false,
    loading: () => <div className="flex h-full items-center justify-center rounded-xl bg-white text-sm text-slate-400">Cargando emojis…</div>,
  }
);

/**
 * Inserta texto en la posición del cursor de un campo (o reemplaza la selección). Usa el setter
 * nativo + evento "input", como toggleBold, para que funcione en campos controlados de React.
 */
export function insertAtCaret(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const s = el.selectionStart ?? el.value.length;
  const e = el.selectionEnd ?? s;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, el.value.slice(0, s) + text + el.value.slice(e));
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.focus();
  el.setSelectionRange(s + text.length, s + text.length);
}

/**
 * Botón de carita que abre el selector de emojis con buscador en español. `onPick` recibe el
 * emoji elegido (para un campo de texto: insertAtCaret). El selector va en un portal con
 * posición fija, arriba o abajo del botón según el espacio, sin salirse de la pantalla.
 */
export function EmojiButton({ onPick, className, title = "Agregar emoji" }: { onPick: (emoji: string) => void; className?: string; title?: string }) {
  const [pos, setPos] = useState<{ top: number; left: number; height: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  function toggle() {
    if (pos) return setPos(null);
    const r = buttonRef.current!.getBoundingClientRect();
    const height = Math.min(HEIGHT, window.innerHeight - 16); // pantallas bajas: se achica, nunca se sale
    const top = r.top >= height + 16 ? r.top - height - 6 : Math.max(8, Math.min(r.bottom + 6, window.innerHeight - height - 8));
    const left = Math.max(8, Math.min(r.right - WIDTH, window.innerWidth - WIDTH - 8));
    setPos({ top, left, height });
  }

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!popRef.current?.contains(t) && !buttonRef.current?.contains(t)) close();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    // Con posición fija no acompaña el scroll de la página: se cierra (el scroll dentro del selector no cuenta).
    function onScroll(e: Event) {
      if (!popRef.current?.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        // mouseDown: el campo no pierde la posición del cursor antes de insertar.
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        title={title}
        aria-label={title}
        aria-expanded={!!pos}
        className={className ?? "cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"}
      >
        <SmileIcon className="h-4 w-4" />
      </button>
      {pos &&
        createPortal(
          <div ref={popRef} className="fixed z-[70] rounded-xl shadow-[0_16px_40px_rgba(15,23,42,0.18)]" style={{ top: pos.top, left: pos.left, width: WIDTH, height: pos.height }}>
            <Picker
              height={pos.height}
              onPick={(emoji) => {
                setPos(null);
                onPick(emoji);
              }}
            />
          </div>,
          document.body
        )}
    </>
  );
}
