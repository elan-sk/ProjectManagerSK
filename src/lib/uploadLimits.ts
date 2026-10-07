// Tope de subida, compartido por el servidor (uploadFile.ts) y el navegador
// (uploadWithProgress.ts): el navegador frena el archivo antes de enviarlo,
// así no se sube de balde algo que el servidor va a rechazar.
export const MAX_UPLOAD_MB = 50;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

export const TOO_LARGE_MESSAGE = `El archivo pesa más de ${MAX_UPLOAD_MB} MB, el máximo permitido. Se recomienda subirlo a Google Drive u otro servicio (con permiso «Cualquier persona con el enlace») y agregar aquí el enlace.`;

export function isTooLarge(file: { size: number }) {
  return file.size > MAX_UPLOAD_BYTES;
}

/** Comprimidos admitidos (extensión → tipo). Fuente única para la subida y para servirlos. */
export const ARCHIVE_MIME: Record<string, string> = {
  ".zip": "application/zip",
  ".rar": "application/vnd.rar",
  ".7z": "application/x-7z-compressed",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  ".tgz": "application/gzip",
  ".bz2": "application/x-bzip2",
  ".tbz2": "application/x-bzip2",
  ".xz": "application/x-xz",
  ".txz": "application/x-xz",
};

// Lo que ofrece el selector de archivos de cada zona de subida (una sola fuente; antes había 8 copias).
// Comprimidos (pedido del usuario 2026-10-07): zip, rar, 7z y los de Linux (tar, gz/tgz, bz2, xz).
export const ARCHIVE_ACCEPT = ".zip,.rar,.7z,.tar,.gz,.tgz,.bz2,.tbz2,.xz,.txz";
/** Link compartido (visitante externo): todo menos HTML. */
export const UPLOAD_ACCEPT_PUBLIC = `image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md,${ARCHIVE_ACCEPT}`;
/** Zonas internas (el servidor igual rechaza HTML si quien sube no es PM ni administrador). */
export const UPLOAD_ACCEPT = `${UPLOAD_ACCEPT_PUBLIC},.html`;
