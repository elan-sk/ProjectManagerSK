"use client";

import { useEffect } from "react";

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
      <div className="relative flex max-h-full w-full max-w-4xl flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-black shadow-[0_8px_30px_rgba(15,23,42,0.3)]">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
            title={title}
            allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="h-full w-full border-0"
          />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-2">
          <span className="min-w-0 truncate text-sm text-slate-700">{title}</span>
          <div className="flex flex-shrink-0 items-center gap-3">
            <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer" className="text-sm font-medium text-slate-900 hover:underline">
              Abrir en YouTube
            </a>
            <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-900">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
