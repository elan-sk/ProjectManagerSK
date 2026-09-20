"use client";

import { useEffect, useRef, useState } from "react";
import { ModalShell } from "@/components/Modal";

const VIEW = 280; // lado del recuadro de recorte (px en pantalla)
const OUT = 512; // lado de la imagen resultante (px)
const MAX_ZOOM = 4;

/**
 * Recorte cuadrado de una imagen antes de subirla (foto de perfil): se arrastra para
 * encuadrar y el control de zoom acerca/aleja. El resultado es un JPG de 512×512 hecho
 * en el navegador con canvas — sin librerías. El círculo muestra cómo se verá el avatar.
 */
export function ImageCropModal({ file, title = "Recortar foto", round = true, onCancel, onConfirm }: { file: File; title?: string; round?: boolean; onCancel: () => void; onConfirm: (cropped: File) => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Escala base: la imagen cubre todo el recuadro; el zoom se suma encima.
  const cover = size ? Math.max(VIEW / size.w, VIEW / size.h) : 1;
  const scale = cover * zoom;

  // La imagen nunca deja huecos dentro del recuadro.
  function clamp(o: { x: number; y: number }, z = zoom) {
    if (!size) return o;
    const s = cover * z;
    const maxX = Math.max(0, (size.w * s - VIEW) / 2);
    const maxY = Math.max(0, (size.h * s - VIEW) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, o.x)), y: Math.min(maxY, Math.max(-maxY, o.y)) };
  }

  function changeZoom(z: number) {
    const next = Math.min(MAX_ZOOM, Math.max(1, z));
    setZoom(next);
    setOffset((o) => clamp(o, next));
  }

  function confirm() {
    const img = imgRef.current;
    if (!img || !size) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return setError("Tu navegador no permite recortar la imagen.");
    ctx.fillStyle = "#fff"; // fondo para PNG con transparencia
    ctx.fillRect(0, 0, OUT, OUT);
    // Parte de la imagen original que queda dentro del recuadro.
    const sw = VIEW / scale;
    const sx = (size.w * scale) / 2 / scale - VIEW / 2 / scale - offset.x / scale;
    const sy = (size.h * scale) / 2 / scale - VIEW / 2 / scale - offset.y / scale;
    ctx.drawImage(img, sx, sy, sw, sw, 0, 0, OUT, OUT);
    canvas.toBlob(
      (blob) => {
        if (!blob) return setError("No se pudo recortar la imagen.");
        onConfirm(new File([blob], "avatar.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92
    );
  }

  return (
    <ModalShell open onClose={onCancel} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Arrastrá la imagen para encuadrarla y usá el zoom. Lo que queda dentro del recuadro es la imagen final.</p>
        <div
          className="relative mx-auto touch-none select-none overflow-hidden rounded-lg bg-slate-200"
          style={{ width: VIEW, height: VIEW, cursor: drag.current ? "grabbing" : "grab" }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            setOffset(clamp({ x: drag.current.ox + e.clientX - drag.current.px, y: drag.current.oy + e.clientY - drag.current.py }));
          }}
          onPointerUp={() => (drag.current = null)}
          onWheel={(e) => changeZoom(zoom - e.deltaY * 0.002)}
        >
          {src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef}
              src={src}
              alt="Imagen a recortar"
              draggable={false}
              onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              className="pointer-events-none absolute max-w-none"
              style={
                size
                  ? { width: size.w * scale, height: size.h * scale, left: VIEW / 2 - (size.w * scale) / 2 + offset.x, top: VIEW / 2 - (size.h * scale) / 2 + offset.y }
                  : { opacity: 0 }
              }
            />
          )}
          {/* Guía: la forma final (círculo para personas, cuadrado redondeado para proyectos); lo de afuera se atenúa. */}
          <div className={`pointer-events-none absolute inset-0 ${round ? "rounded-full" : "rounded-lg"} border-2 border-white shadow-[0_0_0_999px_rgba(15,23,42,0.45)]`} />
        </div>

        <label className="flex items-center gap-3 text-xs text-slate-500">
          Zoom
          <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} onChange={(e) => changeZoom(Number(e.target.value))} aria-label="Zoom" className="flex-1" />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            Cancelar
          </button>
          <button type="button" disabled={!size} onClick={confirm} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
            Usar esta foto
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
