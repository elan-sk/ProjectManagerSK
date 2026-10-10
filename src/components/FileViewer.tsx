"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { ModalShell } from "@/components/Modal";
import { AttachmentPreviewModal, isPreviewable } from "@/components/AttachmentPreviewModal";
import { YouTubeModal } from "@/components/YouTubeModal";
import { AttachmentLightbox } from "@/app/(app)/projects/[id]/tasks/[taskId]/AttachmentLightbox";
import { CredentialLoader } from "@/app/(app)/credentials/CredentialView";
import { LINK_MIME_TYPE, credentialIdFromRef, youtubeVideoId } from "@/lib/attachments";
import { mimeFromFileName } from "@/lib/uploadLimits";

/** Archivo, link o contraseña a abrir. Sin `mimeType` se deduce por la extensión del nombre o de la ruta. */
export type ViewFile = { id?: string; url: string; name: string; mimeType?: string; place?: { href: string; title: string } };

const GENERIC = "application/octet-stream";
function resolveMime(f: ViewFile) {
  if (f.mimeType && f.mimeType !== GENERIC) return f.mimeType;
  const byName = mimeFromFileName(f.name);
  const mime = byName !== GENERIC ? byName : mimeFromFileName(f.url);
  if (mime !== GENERIC) return mime;
  return /\.html?$/i.test(f.url.split(/[?#]/)[0]) || /\.html?$/i.test(f.name) ? "text/html" : GENERIC;
}

/** ¿La ruta es de un archivo (subido a la app o con extensión conocida) y no una página? Para links del chat del bot. */
export function isFileHref(href: string) {
  return href.startsWith("/uploads/") || resolveMime({ url: href, name: "" }) !== GENERIC;
}

/**
 * Abre un adjunto en el visor que le corresponde — imagen en el lightbox, documento en el visor
 * de documentos, YouTube en su reproductor, contraseña en su visor —, el mismo criterio que las
 * fichas de archivos (AttachmentGrid). Un link común abre en pestaña nueva y un archivo sin vista
 * previa se descarga. `viewer` se pinta donde sea: va en portal a <body>, por encima de todo.
 */
export function useFileViewer() {
  const [file, setFile] = useState<(ViewFile & { mimeType: string }) | null>(null);

  function open(f: ViewFile) {
    const mimeType = resolveMime(f);
    const viewable = credentialIdFromRef(f.url) || mimeType.startsWith("image/") || isPreviewable(mimeType) || (mimeType === LINK_MIME_TYPE && youtubeVideoId(f.url));
    if (viewable) return setFile({ ...f, mimeType });
    if (mimeType === LINK_MIME_TYPE) return void window.open(f.url, "_blank", "noopener,noreferrer");
    const a = document.createElement("a");
    a.href = f.url;
    a.download = f.name;
    a.click();
  }

  function render(f: ViewFile & { mimeType: string }) {
    const close = () => setFile(null);
    const id = f.id ?? f.url;
    const credentialId = credentialIdFromRef(f.url);
    const videoId = f.mimeType === LINK_MIME_TYPE ? youtubeVideoId(f.url) : null;
    if (credentialId)
      return (
        <ModalShell open onClose={close} title="Contraseña">
          <CredentialLoader credentialId={credentialId} onClose={close} />
        </ModalShell>
      );
    if (videoId) return <YouTubeModal videoId={videoId} title={f.name} onClose={close} />;
    if (f.mimeType.startsWith("image/"))
      return <AttachmentLightbox images={[{ id, url: f.url, name: f.name, taskLink: f.place }]} openId={id} onClose={close} onNavigate={() => {}} canDelete={false} />;
    return <AttachmentPreviewModal file={{ id, url: f.url, name: f.name, mimeType: f.mimeType, taskLink: f.place }} onClose={close} />;
  }

  return { open, isOpen: file !== null, viewer: file ? createPortal(render(file), document.body) : null };
}
