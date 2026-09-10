// Marcador de mimeType para diferenciar un link pegado por el usuario de un
// archivo subido — reusa el mismo modelo Attachment en vez de sumar una
// tabla/columna nueva solo para esto.
export const LINK_MIME_TYPE = "text/uri-list";

export type AttachmentFileType = "image" | "document" | "link";

export function attachmentFileType(mimeType: string): AttachmentFileType {
  if (mimeType === LINK_MIME_TYPE) return "link";
  if (mimeType.startsWith("image/")) return "image";
  return "document";
}
