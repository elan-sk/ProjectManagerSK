"use client";

import { useState } from "react";
import { AttachmentLightbox } from "@/app/(app)/projects/[id]/tasks/[taskId]/AttachmentLightbox";
import type { PublicFile } from "@/lib/publicView";

// Comparador del link compartido: la imagen de Antes encima de la de Después,
// recortada hasta donde está la barra. Pares por posición (1.ª con 1.ª…).
export function BeforeAfterSlider({ before, after }: { before: PublicFile[]; after: PublicFile[] }) {
  const [pair, setPair] = useState(0);
  const [position, setPosition] = useState(50);
  const [openImageId, setOpenImageId] = useState<string | null>(null);
  const pairs = Math.min(before.length, after.length);
  const sequence = [...before.map((f) => ({ ...f, group: "Antes" })), ...after.map((f) => ({ ...f, group: "Después" }))];
  const b = before[pair];
  const a = after[pair];

  return (
    <div className="space-y-1.5">
      <div className="relative select-none overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={a.url} alt={a.name} className="block max-h-[70vh] w-full object-contain" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={b.url}
          alt={b.name}
          className="absolute inset-0 h-full w-full bg-slate-100 object-contain"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
          draggable={false}
        />
        <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow" style={{ left: `${position}%` }}>
          <span className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-600 shadow">‹›</span>
        </div>
        <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">Antes</span>
        <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Después</span>
        <input
          type="range"
          min={0}
          max={100}
          value={position}
          onChange={(e) => setPosition(Number(e.target.value))}
          aria-label="Deslizar para comparar antes y después"
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-[13px] text-slate-500">
        {pairs > 1 ? (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPair((pair - 1 + pairs) % pairs)} className="rounded border border-slate-300 px-2 leading-6" aria-label="Par anterior">‹</button>
            <span>Imagen {pair + 1} de {pairs}</span>
            <button type="button" onClick={() => setPair((pair + 1) % pairs)} className="rounded border border-slate-300 px-2 leading-6" aria-label="Par siguiente">›</button>
          </div>
        ) : (
          <span />
        )}
        <button type="button" onClick={() => setOpenImageId(b.id)} className="underline hover:text-slate-700">Ver en grande</button>
      </div>
      {openImageId && (
        <AttachmentLightbox images={sequence} openId={openImageId} onClose={() => setOpenImageId(null)} onNavigate={setOpenImageId} canDelete={false} />
      )}
    </div>
  );
}
