import { normalizeSearchText } from "@/lib/search";

// Respuestas a una prueba «Con errores» (Configuración → Pruebas): las de la categoría con el mismo nombre que la
// prueba y, si no hay, las de «Otro». Fuente única para la app (ReviewPanel), la API/bot (getTaskDesign) y el
// guardado de respuestas nuevas (setCheckResponse). Sin prisma: sirve en el navegador.
export const FALLBACK_RESPONSE_CATEGORY = "Otro";

export function pickResponseCategory<T extends { name: string }>(categories: T[], checkCategory: string | null) {
  const wanted = normalizeSearchText((checkCategory ?? "").trim());
  return (
    (wanted ? categories.find((c) => normalizeSearchText(c.name) === wanted) : undefined) ??
    categories.find((c) => normalizeSearchText(c.name) === normalizeSearchText(FALLBACK_RESPONSE_CATEGORY))
  );
}

/** Misma respuesta ignorando mayúsculas, tildes y espacios de más: no se guarda dos veces. */
export function sameResponse(a: string, b: string) {
  const norm = (s: string) => normalizeSearchText(s).replace(/\s+/g, " ").trim();
  return norm(a) === norm(b);
}
