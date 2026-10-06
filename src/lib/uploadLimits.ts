// Tope de subida, compartido por el servidor (uploadFile.ts) y el navegador
// (uploadWithProgress.ts): el navegador frena el archivo antes de enviarlo,
// así no se sube de balde algo que el servidor va a rechazar.
export const MAX_UPLOAD_MB = 20;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

export const TOO_LARGE_MESSAGE = `El archivo pesa más de ${MAX_UPLOAD_MB} MB, el máximo permitido. Se recomienda subirlo a Google Drive u otro servicio (con permiso «Cualquier persona con el enlace») y agregar aquí el enlace.`;

export function isTooLarge(file: { size: number }) {
  return file.size > MAX_UPLOAD_BYTES;
}
