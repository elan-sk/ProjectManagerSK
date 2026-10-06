import { isTooLarge, TOO_LARGE_MESSAGE } from "@/lib/uploadLimits";

export type UploadResponse = { url: string; name: string; mimeType: string; error?: string };

// fetch no informa el avance de una subida; XMLHttpRequest sí (upload.onprogress).
// Devuelve lo mismo que se usaba de fetch: si respondió bien y el JSON del cuerpo.
// Un archivo por encima del tope no se envía: vuelve el mismo error del servidor
// (con la sugerencia de dejar un enlace) sin gastar la subida.
export function uploadWithProgress(url: string, formData: FormData, onProgress?: (fraction: number) => void): Promise<{ ok: boolean; body: UploadResponse }> {
  const file = formData.get("file");
  if (file instanceof Blob && isTooLarge(file)) {
    return Promise.resolve({ ok: false, body: { error: TOO_LARGE_MESSAGE } as UploadResponse });
  }
  return new Promise<{ ok: boolean; body: UploadResponse }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let body = {} as UploadResponse;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      // Si un proxy corta antes con 413 (HTML, sin JSON), igual se ve la sugerencia.
      if (xhr.status === 413 && !body.error) body.error = TOO_LARGE_MESSAGE;
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, body });
    };
    xhr.onerror = () => reject(new Error("No se pudo subir"));
    xhr.send(formData);
  });
}
