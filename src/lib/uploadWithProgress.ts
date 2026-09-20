export type UploadResponse = { url: string; name: string; mimeType: string; error?: string };

// fetch no informa el avance de una subida; XMLHttpRequest sí (upload.onprogress).
// Devuelve lo mismo que se usaba de fetch: si respondió bien y el JSON del cuerpo.
export function uploadWithProgress(url: string, formData: FormData, onProgress: (fraction: number) => void) {
  return new Promise<{ ok: boolean; body: UploadResponse }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body = {} as UploadResponse;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, body });
    };
    xhr.onerror = () => reject(new Error("No se pudo subir"));
    xhr.send(formData);
  });
}
