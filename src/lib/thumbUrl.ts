// Miniaturas de imágenes subidas: /uploads/<archivo>?w=320|800 devuelve una versión WebP achicada
// (la genera src/lib/thumbnails.ts en el servidor). Sin ?w= se sirve el original, que es lo que
// deben usar los visores a pantalla completa. Este archivo no importa nada de Node: se usa en el navegador.
export const THUMB_WIDTHS = [320, 800] as const;
export type ThumbWidth = (typeof THUMB_WIDTHS)[number];
export const RASTER_IMAGE = /\.(png|jpe?g|webp)$/i;

/** URL de la miniatura para una imagen subida; cualquier otra URL (SVG, GIF, externa, blob:, data:) vuelve igual. */
export function thumbUrl<T extends string | null | undefined>(url: T, width: ThumbWidth): T {
  if (!url) return url;
  const [base] = url.split(/[?#]/);
  return (/^(https?:\/\/[^/]+)?\/uploads\/[^/]+$/i.test(base) && RASTER_IMAGE.test(base) ? `${base}?w=${width}` : url) as T;
}

export const parseThumbWidth = (value: string | null): ThumbWidth | null =>
  THUMB_WIDTHS.find((w) => String(w) === value) ?? null;
