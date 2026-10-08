// Marcador de mimeType para diferenciar un link pegado por el usuario de un
// archivo subido — reusa el mismo modelo Attachment en vez de sumar una
// tabla/columna nueva solo para esto.
export const LINK_MIME_TYPE = "text/uri-list";
export const HTML_MIME_TYPE = "text/html";

// Credencial (URL, usuario y contraseña): se muestra como una ficha más del
// sistema de archivos, pero su "url" es `credential:<id>` y su contenido se
// pide aparte al abrirla (ver src/lib/credentials.ts) — la contraseña nunca
// viaja en las listas.
export const CREDENTIAL_MIME_TYPE = "application/x-pmsk-credential";
export const credentialRef = (credentialId: string) => `credential:${credentialId}`;
export const credentialIdFromRef = (url: string) => (url.startsWith("credential:") ? url.slice("credential:".length) : null);
/** URL de una contraseña para mostrar bajo su ficha: sin protocolo ni barra final. */
export const credentialUrlLabel = (url: string | null | undefined) => (url ? url.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "") || undefined : undefined);

export type AttachmentFileType = "image" | "document" | "link" | "credential";

export function attachmentFileType(mimeType: string): AttachmentFileType {
  if (mimeType === CREDENTIAL_MIME_TYPE) return "credential";
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

/**
 * Spec 001: clave para saber si dos links son el mismo, sin importar el nombre
 * que les puso cada persona. Ignora espacios, http/https, «www.», mayúsculas
 * del dominio, la barra final y el #ancla; un video de YouTube es el mismo con
 * cualquiera de sus formatos (youtu.be, watch?v=, shorts…). Un archivo subido
 * (/uploads/…) ya es único por contenido: se compara tal cual.
 */
export function linkKey(url: string): string {
  const raw = url.trim();
  if (raw.startsWith("/uploads/") || raw.startsWith("credential:")) return raw;
  const video = youtubeVideoId(raw);
  if (video) return `youtube:${video}`;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    return `${host}${path}${u.search}`;
  } catch {
    return raw;
  }
}

export function linkHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Color y etiqueta por tipo de documento, los que la gente ya asocia a cada programa:
// Word azul, PDF rojo, Excel verde, PowerPoint naranja. Va por extensión y, si no hay, por mimeType.
export type DocumentStyle = { label: string; text: string; bg: string; border: string; hover: string; name: string };

// Los azules/rojos/naranjas de la paleta de la app están corridos hacia el verde azulado y el marrón, por eso
// acá van los colores propios de cada programa (Word #2B579A, PDF rojo, Excel #217346, PowerPoint naranja).
const DOC_STYLES = {
  pdf: { label: "PDF", text: "text-[#d92d20]", bg: "bg-[#d92d20]/10", border: "border-[#d92d20]/30", hover: "hover:border-[#d92d20] hover:bg-[#d92d20]/20", name: "text-[#8f1a12]" },
  word: { label: "WORD", text: "text-[#2b579a]", bg: "bg-[#2b579a]/10", border: "border-[#2b579a]/30", hover: "hover:border-[#2b579a] hover:bg-[#2b579a]/20", name: "text-[#1a3665]" },
  excel: { label: "EXCEL", text: "text-[#217346]", bg: "bg-[#217346]/10", border: "border-[#217346]/30", hover: "hover:border-[#217346] hover:bg-[#217346]/20", name: "text-[#124a2c]" },
  powerpoint: { label: "PPT", text: "text-[#f0740f]", bg: "bg-[#f0740f]/10", border: "border-[#f0740f]/35", hover: "hover:border-[#f0740f] hover:bg-[#f0740f]/20", name: "text-[#9a4708]" },
  html: { label: "HTML", text: "text-[#7c3aed]", bg: "bg-[#7c3aed]/10", border: "border-[#7c3aed]/30", hover: "hover:border-[#7c3aed] hover:bg-[#7c3aed]/20", name: "text-[#4c1d95]" },
  archive: { label: "ZIP", text: "text-[#8a5a14]", bg: "bg-[#c08a2b]/10", border: "border-[#c08a2b]/35", hover: "hover:border-[#c08a2b] hover:bg-[#c08a2b]/20", name: "text-[#5c3c0c]" },
  text: { label: "TXT / MD", text: "text-slate-600", bg: "bg-slate-100", border: "border-slate-200", hover: "hover:border-slate-500 hover:bg-slate-200", name: "text-slate-800" },
} satisfies Record<string, DocumentStyle>;

export function documentStyle(mimeType: string, name: string): DocumentStyle {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf" || mimeType === "application/pdf") return DOC_STYLES.pdf;
  if (ext === "doc" || ext === "docx" || mimeType.includes("word")) return DOC_STYLES.word;
  if (ext === "xls" || ext === "xlsx" || ext === "csv" || mimeType.includes("sheet") || mimeType.includes("excel") || mimeType === "text/csv") return DOC_STYLES.excel;
  if (ext === "ppt" || ext === "pptx" || mimeType.includes("presentation") || mimeType.includes("powerpoint")) return DOC_STYLES.powerpoint;
  if (ext === "html" || ext === "htm" || mimeType === "text/html") return DOC_STYLES.html;
  // Comprimidos: color propio (ocre) para distinguirlos de los documentos.
  if (["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "tbz2", "xz", "txz"].includes(ext)) return DOC_STYLES.archive;
  // Texto plano (txt, md, markdown, log, rtf, json, xml…) y cualquier otra extensión: nunca queda una ficha sin estilo.
  return DOC_STYLES.text;
}
