// Lógica pura (sin DOM) del "pegar captura desde el portapapeles" en las
// áreas de subida — el listener y el input real viven en usePasteImage.ts.

// Los mismos tipos de imagen que acepta el servidor (ver uploadFile.ts).
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Primera imagen soportada de una lista de archivos del portapapeles. */
export function pickPastedImage<T extends { type: string }>(files: T[]): T | undefined {
  return files.find((f) => f.type in EXT_BY_MIME);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Nombre para la captura pegada (el portapapeles la entrega siempre como "image.png"). */
export function pastedImageName(mime: string, now = new Date()): string {
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `captura-${stamp}.${EXT_BY_MIME[mime] ?? "png"}`;
}

/**
 * Si el foco está en un campo de texto Y el portapapeles trae también texto
 * (ej. celdas de Excel o texto con formato copiado de Word/web, que traen
 * imagen + texto), gana el pegado normal de texto. Una captura de pantalla
 * trae solo la imagen, así que sí se toma aunque el foco esté en un campo.
 */
export function shouldHandlePaste(hasImage: boolean, targetEditable: boolean, clipboardHasText: boolean) {
  return hasImage && !(targetEditable && clipboardHasText);
}

/**
 * Elige qué área de subida recibe la imagen cuando hay varias en la página:
 * la que tiene el mouse encima o el foco dentro (`hovered`; si son varias
 * anidadas, la más chica); si ninguna, solo se usa cuando hay UNA sola en la
 * página — con dos o más y sin mouse encima no se adivina (no se sube a la
 * equivocada). `allowFallback: false` deja solo el criterio de mouse/foco:
 * es lo que usa el indicador visual (no tiene sentido resaltar siempre la
 * única área de la página).
 */
export function chooseTarget<T>(candidates: { id: T; hovered: boolean; area: number }[], allowFallback = true): T | undefined {
  const hovered = candidates.filter((c) => c.hovered).sort((a, b) => a.area - b.area);
  if (hovered.length > 0) return hovered[0].id;
  return allowFallback && candidates.length === 1 ? candidates[0].id : undefined;
}
