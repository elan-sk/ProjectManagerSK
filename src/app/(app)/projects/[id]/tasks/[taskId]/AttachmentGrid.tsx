"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AttachmentPreview } from "./AttachmentPreview";
import { AttachmentLightbox } from "./AttachmentLightbox";
import { AttachmentPreviewModal, isPreviewable } from "@/components/AttachmentPreviewModal";
import { YouTubeModal } from "@/components/YouTubeModal";
import { LINK_MIME_TYPE, youtubeVideoId } from "@/lib/attachments";
import { removeAttachment } from "./actions";

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
  wide,
}: {
  items: AttachmentGridItem[];
  canDelete: boolean;
  className?: string;
  /** Todas las fichas del mismo ancho (vista «Archivos»). */
  wide?: boolean;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [openPreview, setOpenPreview] = useState<AttachmentGridItem | null>(null);
  const [openVideo, setOpenVideo] = useState<{ id: string; name: string } | null>(null);
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
            wide={wide}
            taskLink={a.taskLink}
            onOpenImage={a.mimeType.startsWith("image/") ? () => setOpenId(a.id) : undefined}
            onOpenPreview={isPreviewable(a.mimeType) ? () => setOpenPreview(a) : undefined}
            onOpenVideo={
              a.mimeType === LINK_MIME_TYPE && youtubeVideoId(a.url)
                ? () => setOpenVideo({ id: youtubeVideoId(a.url)!, name: a.name })
                : undefined
            }
          />
        ))}
      </div>
      {openId && (
        <AttachmentLightbox images={images} openId={openId} onClose={() => setOpenId(null)} onNavigate={setOpenId} canDelete={canDelete} />
      )}
      {openVideo && <YouTubeModal videoId={openVideo.id} title={openVideo.name} onClose={() => setOpenVideo(null)} />}
      {openPreview && (
        <AttachmentPreviewModal
          file={openPreview}
          onClose={() => setOpenPreview(null)}
          onDelete={
            canDelete
              ? async () => {
                  await removeAttachment(openPreview.id);
                  router.refresh();
                }
              : undefined
          }
        />
      )}
    </>
  );
}
