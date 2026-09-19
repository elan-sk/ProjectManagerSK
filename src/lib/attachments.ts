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

// Id del video para links de YouTube (watch, youtu.be, shorts, embed, live) —
// null si el link no es de YouTube. Alimenta el visor integrado.
export function youtubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|m)\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.pathname === "/watch") id = u.searchParams.get("v");
      else {
        const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/]+)/);
        id = m?.[1] ?? null;
      }
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function linkHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
