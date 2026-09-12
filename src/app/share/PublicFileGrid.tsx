"use client";

import { useState } from "react";
import { DocumentIcon, LinkIcon } from "@/components/icons";
import { AttachmentPreviewModal, isPreviewable } from "@/components/AttachmentPreviewModal";
import { AttachmentLightbox } from "@/app/(app)/projects/[id]/tasks/[taskId]/AttachmentLightbox";
import { LINK_MIME_TYPE } from "@/lib/attachments";
import type { PublicFile } from "@/lib/publicView";

// Grilla de archivos compartida entre el "Archivos" del proyecto y los
// insumos/evidencia/antes-después de una tarea (puntos 15/16) — mismos
// visores que ya existen puertas adentro: el carrusel de imágenes
// (AttachmentLightbox, navega con ‹ › sin volver a abrir cada una) y el
// visor de PDF/Word/Excel (AttachmentPreviewModal). Nunca se pasa onDelete
// ni canDelete=true acá — ninguno de los dos muestra el botón de eliminar
// sin eso.
export function PublicFileGrid({ files }: { files: PublicFile[] }) {
  const [preview, setPreview] = useState<PublicFile | null>(null);
  const [openImageId, setOpenImageId] = useState<string | null>(null);
  const images = files.filter((f) => f.mimeType.startsWith("image/"));

  if (files.length === 0) return <p className="text-xs text-slate-400">Sin archivos.</p>;

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {files.map((f) => {
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
