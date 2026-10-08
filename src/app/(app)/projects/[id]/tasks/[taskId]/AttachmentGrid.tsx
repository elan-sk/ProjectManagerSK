"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AttachmentPreview } from "./AttachmentPreview";
import { AttachmentLightbox } from "./AttachmentLightbox";
import { AttachmentPreviewModal, isPreviewable } from "@/components/AttachmentPreviewModal";
import { YouTubeModal } from "@/components/YouTubeModal";
import { LINK_MIME_TYPE, youtubeVideoId } from "@/lib/attachments";
import { removeAttachment } from "./actions";
import type { CredentialPlace } from "@/lib/credentialPlace";

export type AttachmentGridItem = {
  id: string;
  url: string;
  name: string;
  mimeType: string;
  taskLink?: { href: string; title: string };
  /** Vista "Archivos": todos los lugares que usan este mismo archivo. */
  usedIn?: { href: string; title: string }[];
  /** false = no se ofrece borrar esta ficha aunque el grupo permita borrar (archivo usado en varios lugares). */
  canDelete?: boolean;
  /** Texto corto bajo la ficha (ej. «del paso: …» en los Insumos que salieron de un paso del checklist). */
  caption?: string;
  /** Segunda línea de la ficha (hoy: la URL de una contraseña). */
  subtitle?: string;
  /** Contraseña en una tarea, paso o ajuste: su visor ofrece quitarla de ahí a quien puede editar la tarea. */
  credentialPlace?: CredentialPlace;
  credentialCanRemove?: boolean;
  /** Se creó en ese lugar (no vino de la galería) y la persona puede eliminarla: al quitarla se ofrece eliminarla del todo. */
  credentialCanDelete?: boolean;
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
            canDelete={canDelete && a.canDelete !== false}
            taskLink={a.taskLink}
            usedIn={a.usedIn}
            caption={a.caption}
            subtitle={a.subtitle}
            credentialPlace={a.credentialPlace}
            credentialCanRemove={a.credentialCanRemove}
            credentialCanDelete={a.credentialCanDelete}
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
            canDelete && openPreview.canDelete !== false
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
