"use client";

import { useState } from "react";
import { AttachmentPreview } from "./AttachmentPreview";
import { AttachmentLightbox } from "./AttachmentLightbox";

export type AttachmentGridItem = {
  id: string;
  url: string;
  name: string;
  mimeType: string;
  taskLink?: { href: string; title: string };
};

/**
 * Grilla de adjuntos de un mismo grupo (Insumos, Evidencia, o el filtro de
 * la vista "Archivos") — comparten un único lightbox para poder navegar
 * entre las imágenes del grupo sin cerrar la vista previa.
 */
export function AttachmentGrid({
  items,
  canDelete,
  className,
}: {
  items: AttachmentGridItem[];
  canDelete: boolean;
  className?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const images = items.filter((i) => i.mimeType.startsWith("image/"));

  return (
    <>
      <div className={className ?? "grid grid-cols-2 gap-2"}>
        {items.map((a) => (
          <AttachmentPreview
            key={a.id}
            id={a.id}
            url={a.url}
            name={a.name}
            mimeType={a.mimeType}
            canDelete={canDelete}
            taskLink={a.taskLink}
            onOpenImage={a.mimeType.startsWith("image/") ? () => setOpenId(a.id) : undefined}
          />
        ))}
      </div>
      {openId && (
        <AttachmentLightbox images={images} openId={openId} onClose={() => setOpenId(null)} onNavigate={setOpenId} canDelete={canDelete} />
      )}
    </>
  );
}
