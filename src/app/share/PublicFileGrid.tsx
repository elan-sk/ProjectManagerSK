"use client";

import { useMemo, useState } from "react";
import { DocumentIcon, LinkIcon, SearchIcon } from "@/components/icons";
import { AttachmentPreviewModal, isPreviewable } from "@/components/AttachmentPreviewModal";
import { AttachmentLightbox } from "@/app/(app)/projects/[id]/tasks/[taskId]/AttachmentLightbox";
import { LINK_MIME_TYPE } from "@/lib/attachments";
import { normalizeSearchText } from "@/lib/search";
import type { PublicFile } from "@/lib/publicView";

// Grilla de archivos compartida entre el "Archivos" del proyecto y los
// insumos/evidencia/antes-después de una tarea (puntos 15/16) — mismos
// visores que ya existen puertas adentro: el carrusel de imágenes
// (AttachmentLightbox, navega con ‹ › sin volver a abrir cada una) y el
// visor de PDF/Word/Excel (AttachmentPreviewModal). Nunca se pasa onDelete
// ni canDelete=true acá — ninguno de los dos muestra el botón de eliminar
// sin eso.
// Punto 4: buscador por nombre de archivo — solo se muestra a partir de una
// cantidad razonable de archivos (con pocos, un input encima solo estorba).
const SEARCH_THRESHOLD = 6;

// sequence: carrusel del visor cuando debe seguir más allá de esta grilla
// (ej. Antes → Después de un ajuste); por defecto son las imágenes de files.
export function PublicFileGrid({ files, sequence }: { files: PublicFile[]; sequence?: (PublicFile & { group?: string })[] }) {
  const [preview, setPreview] = useState<PublicFile | null>(null);
  const [openImageId, setOpenImageId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const images = (sequence ?? files).filter((f) => f.mimeType.startsWith("image/"));
  const filtered = useMemo(
    () => (query.trim() ? files.filter((f) => normalizeSearchText(f.name).includes(normalizeSearchText(query))) : files),
    [files, query]
  );

  if (files.length === 0) return <p className="text-xs text-slate-400">Sin archivos.</p>;

  return (
    <>
      {files.length >= SEARCH_THRESHOLD && (
        <div className="relative mb-2">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre…"
            className="w-full rounded-lg border border-slate-300 py-1.5 pl-8 pr-2.5 text-xs"
          />
        </div>
      )}
      {filtered.length === 0 && <p className="text-xs text-slate-400">Sin resultados.</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {filtered.map((f) => {
          const isImage = f.mimeType.startsWith("image/");
          const isLink = f.mimeType === LINK_MIME_TYPE;
          const previewable = isPreviewable(f.mimeType);

          if (isImage) {
            return (
              <button key={f.id} type="button" onClick={() => setOpenImageId(f.id)} className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.name} className="h-16 w-full rounded-lg border border-slate-200 object-cover" />
              </button>
            );
          }

          const content = (
            <div className="flex h-16 w-full flex-col items-center justify-center gap-0.5 rounded-lg border border-slate-200 p-1 text-center text-[10px] text-slate-500">
              {isLink ? <LinkIcon className="h-3.5 w-3.5 text-slate-400" /> : <DocumentIcon className="h-3.5 w-3.5 text-slate-400" />}
              <span className="line-clamp-2 w-full break-words">{f.name}</span>
            </div>
          );

          if (previewable) {
            return (
              <button key={f.id} type="button" onClick={() => setPreview(f)} className="block">
                {content}
              </button>
            );
          }
          return (
            <a key={f.id} href={f.url} target="_blank" rel="noreferrer" download={isLink ? undefined : f.name} className="block">
              {content}
            </a>
          );
        })}
      </div>
      {openImageId && (
        <AttachmentLightbox images={images} openId={openImageId} onClose={() => setOpenImageId(null)} onNavigate={setOpenImageId} canDelete={false} />
      )}
      {preview && <AttachmentPreviewModal file={preview} onClose={() => setPreview(null)} />}
    </>
  );
}
