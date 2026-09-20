"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { removeAttachment } from "./actions";
import { useConfirm } from "@/components/Confirm";

export type LightboxImage = {
  id: string;
  url: string;
  name: string;
  taskLink?: { href: string; title: string };
  /** Etiqueta del tramo del carrusel (ej. Antes / Después); el contador se cuenta dentro de cada tramo. */
  group?: string;
};

const GROUP_BADGE: Record<string, string> = {
  Antes: "bg-amber-500 text-white",
  Después: "bg-emerald-600 text-white",
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.5;

const barButton = "rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent";
const navButton = "absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-2.5 text-slate-700 shadow-md hover:bg-white";

/**
 * Visor de imagen compartido por todo un grupo (Insumos, Evidencia, o el
 * grid de la vista "Archivos"). Cada control tiene un lugar fijo, sin depender
 * del tamaño de la imagen: barra superior (nombre, contador, zoom, descargar,
 * cerrar) y flechas ‹ › en los bordes de la pantalla. La etiqueta del tramo
 * (Antes / Después) va sobre la imagen. Zoom con los botones, la rueda del
 * mouse o un clic sobre la imagen; con zoom, la imagen se arrastra para moverla.
 */
export function AttachmentLightbox({
  images,
  openId,
  onClose,
  onNavigate,
  canDelete,
}: {
  images: LightboxImage[];
  openId: string;
  onClose: () => void;
  onNavigate: (id: string) => void;
  canDelete: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [deleting, setDeleting] = useState(false);
  // El zoom pertenece a la imagen abierta: al cambiar de imagen vuelve solo a 100 %.
  const [state, setState] = useState({ id: openId, scale: 1, x: 0, y: 0 });
  const view = state.id === openId ? state : { id: openId, scale: 1, x: 0, y: 0 };
  const setView = (fn: (v: { scale: number; x: number; y: number }) => { scale: number; x: number; y: number }) =>
    setState((prev) => ({ ...fn(prev.id === openId ? prev : { id: openId, scale: 1, x: 0, y: 0 }), id: openId }));
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const moved = useRef(false); // el gesto fue un arrastre, no un clic

  const index = images.findIndex((i) => i.id === openId);
  const current = images[index];
  const hasMultiple = images.length > 1;
  const groupImages = current?.group ? images.filter((i) => i.group === current.group) : images;
  const groupIndex = current ? groupImages.findIndex((i) => i.id === current.id) : 0;

  // Mantiene la imagen dentro del marco: no se puede arrastrar más allá de sus bordes.
  function clamp(scale: number, x: number, y: number) {
    const rect = frameRef.current?.getBoundingClientRect();
    const maxX = rect ? (rect.width * (scale - 1)) / 2 : 0;
    const maxY = rect ? (rect.height * (scale - 1)) / 2 : 0;
    return { scale, x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  }
  function zoomTo(next: number) {
    const scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
    setView((v) => (scale === MIN_ZOOM ? { scale, x: 0, y: 0 } : clamp(scale, v.x, v.y)));
  }
  const zoomIn = () => zoomTo(view.scale + ZOOM_STEP);
  const zoomOut = () => zoomTo(view.scale - ZOOM_STEP);

  function goPrev() {
    onNavigate(images[(index - 1 + images.length) % images.length].id);
  }
  function goNext() {
    onNavigate(images[(index + 1) % images.length].id);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasMultiple) goPrev();
      else if (e.key === "ArrowRight" && hasMultiple) goNext();
      else if (e.key === "+" || e.key === "=") zoomIn();
      else if (e.key === "-") zoomOut();
      else if (e.key === "0") zoomTo(1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, images.length, view.scale]);

  // Rueda del mouse = zoom. Listener nativo para poder cancelar el scroll de la página.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      zoomTo(view.scale + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
    }
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.scale, current?.id]);

  async function handleDelete() {
    if (!current) return;
    const ok = await confirm(`¿Seguro que querés eliminar "${current.name}"? No vas a poder deshacer esto.`, {
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await removeAttachment(current.id);
      router.refresh();
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  if (!current) return null;

  const zoomed = view.scale > MIN_ZOOM;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70" onClick={onClose}>
      {/* Barra superior: siempre en el mismo lugar. */}
      <div
        className="absolute inset-x-4 top-4 z-20 flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="min-w-0 truncate text-sm text-slate-700">
          {current.name}
          {hasMultiple && <span className="text-slate-400"> ({groupIndex + 1}/{groupImages.length})</span>}
        </span>
        <div className="flex flex-shrink-0 items-center gap-1">
          <button type="button" onClick={zoomOut} disabled={view.scale <= MIN_ZOOM} aria-label="Alejar" title="Alejar (-)" className={barButton}>
            −
          </button>
          <button type="button" onClick={() => zoomTo(1)} disabled={!zoomed} aria-label="Restablecer zoom" title="Restablecer (0)" className={`${barButton} min-w-14 tabular-nums`}>
            {Math.round(view.scale * 100)}%
          </button>
          <button type="button" onClick={zoomIn} disabled={view.scale >= MAX_ZOOM} aria-label="Acercar" title="Acercar (+)" className={barButton}>
            +
          </button>
          <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
          <a href={current.url} download={current.name} className={barButton}>
            Descargar
          </a>
          {current.taskLink && (
            <Link href={current.taskLink.href} className={barButton}>
              Ver tarea
            </Link>
          )}
          {canDelete && (
            <button type="button" onClick={handleDelete} disabled={deleting} className={`${barButton} text-red-600`}>
              Eliminar
            </button>
          )}
          <button type="button" onClick={onClose} className={`${barButton} text-slate-500`}>
            Cerrar
          </button>
        </div>
      </div>

      {hasMultiple && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          aria-label="Imagen anterior"
          className={`${navButton} left-4`}
        >
          <ChevronIcon className="h-5 w-5" direction="left" />
        </button>
      )}
      {hasMultiple && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          aria-label="Imagen siguiente"
          className={`${navButton} right-4`}
        >
          <ChevronIcon className="h-5 w-5" direction="right" />
        </button>
      )}

      {/* Escenario: la imagen va centrada; un clic fuera de ella cierra el visor. */}
      <div ref={stageRef} className="absolute inset-0 flex items-center justify-center px-20 pt-20 pb-6">
        <div
          ref={frameRef}
          className="relative overflow-hidden rounded-xl shadow-[0_8px_30px_rgba(15,23,42,0.3)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.url}
            alt={current.name}
            draggable={false}
            onClick={() => {
              if (moved.current) return;
              zoomTo(zoomed ? 1 : 2);
            }}
            onPointerDown={(e) => {
              moved.current = false;
              if (!zoomed) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (d && Math.hypot(e.clientX - d.px, e.clientY - d.py) > 4) moved.current = true;
              if (d) setView((v) => clamp(v.scale, d.x + e.clientX - d.px, d.y + e.clientY - d.py));
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
            className={`block max-h-[calc(100vh-7rem)] max-w-[calc(100vw-10rem)] touch-none select-none object-contain ${zoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
          />
          {current.group && (
            <span className={`absolute top-3 left-3 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide shadow-sm ${GROUP_BADGE[current.group] ?? "bg-slate-700 text-white"}`}>
              {current.group}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ChevronIcon({ className, direction }: { className?: string; direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d={direction === "left" ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}
