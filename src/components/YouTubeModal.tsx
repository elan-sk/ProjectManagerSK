"use client";

import { useEffect } from "react";
import { ToolbarButton, toolbarButtonClass } from "@/components/ToolbarButton";
import { ExternalLinkIcon, XIcon } from "@/components/icons";

/** Visor integrado de YouTube (youtube-nocookie, sin cookies de seguimiento hasta que se reproduce). */
export function YouTubeModal({ videoId, title, onClose }: { videoId: string; title: string; onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/70" />
      <div className="relative flex max-h-full w-full max-w-4xl flex-col gap-2" onClick={(e) => e.stopPropagation()}>
        {/* Barra arriba, con íconos: mismo lugar y estilo que los demás visores (imágenes, HTML incrustado). */}
        <div className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1 shadow-sm">
          <span className="min-w-0 truncate pl-1 text-xs text-slate-700">{title}</span>
          <div className="flex flex-shrink-0 items-center gap-0.5">
            <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer" title="Abrir en YouTube" aria-label="Abrir en YouTube" className={toolbarButtonClass()}>
              <ExternalLinkIcon className="h-4 w-4" />
            </a>
            <ToolbarButton icon={<XIcon className="h-4 w-4" />} label="Cerrar" onClick={onClose} />
          </div>
        </div>
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-black shadow-[0_8px_30px_rgba(15,23,42,0.3)]">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            className="h-full w-full border-0"
          />
        </div>
      </div>
    </div>
  );
}
