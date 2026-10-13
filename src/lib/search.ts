// Tolerancia compartida por TODOS los buscadores de la app (tareas,
// proyectos, personas en los dropdowns): ignora tildes/diacríticos y
// mayúsculas/minúsculas, así "jose" encuentra "José" y "GESTION" encuentra
// "gestión".
export function normalizeSearchText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export const HEADER_SEARCH_OPTIONS = [
  { prefix: "proyectos", kind: "project", label: "Proyectos" },
  { prefix: "tareas", kind: "task", label: "Tareas" },
  // Estos dos también devuelven tareas, por eso van junto a «Tareas»: las de un tipo (Prueba, Ajuste…) o las que llevan una etiqueta.
  { prefix: "tipos", kind: "taskType", label: "Tipo de tarea" },
  { prefix: "etiquetas", kind: "tag", label: "Etiquetas" },
  { prefix: "comentarios", kind: "comment", label: "Comentarios" },
  { prefix: "archivos", kind: "file", label: "Archivos" },
  { prefix: "links", kind: "link", label: "Links" },
  { prefix: "contraseñas", kind: "credential", label: "Contraseñas" },
] as const;

// Abre el buscador del header con una consulta ya escrita (ej. desde un chip de etiqueta).
export const OPEN_HEADER_SEARCH_EVENT = "header-search:open";
export function openHeaderSearch(query: string) {
  window.dispatchEvent(new CustomEvent<string>(OPEN_HEADER_SEARCH_EVENT, { detail: query }));
}

// Consulta del buscador para una etiqueta: «etiquetas:categoría:» (toda la categoría) o
// «etiquetas:categoría:etiqueta:» — siempre termina en «:», como las sugerencias del buscador.
export function tagSearchQuery(categoryName: string, name?: string) {
  return `etiquetas:${categoryName.toLowerCase()}:${name ? `${name.toLowerCase()}:` : ""}`;
}

export const SEARCH_BAR_MIN_WIDTH = 224;
export const SEARCH_BAR_MIN_VIEWPORT = 1024;

export function isCompactSearch(barWidth: number, viewportWidth: number) {
  return viewportWidth < SEARCH_BAR_MIN_VIEWPORT || barWidth < SEARCH_BAR_MIN_WIDTH;
}

export type HeaderSearchFilter = typeof HEADER_SEARCH_OPTIONS[number]["kind"];

// El atajo se escribe en plural («tareas:»), pero el singular («tarea:») vale igual.
const singular = (s: string) => normalizeSearchText(s.trim()).replace(/s$/, "");

export function parseHeaderSearch(query: string) {
  const trimmed = query.trim();
  const colon = trimmed.indexOf(":");
  const prefix = singular(trimmed.slice(0, colon));
  const filter: HeaderSearchFilter | null = colon < 0 ? null : prefix === "clave" ? "credential"
    : HEADER_SEARCH_OPTIONS.find((option) => singular(option.prefix) === prefix)?.kind ?? null;
  return { filter, text: filter ? trimmed.slice(colon + 1).trim() : trimmed };
}

// Búsqueda de texto tipo buscador de correo: título + descripción (se le
// saca el HTML del editor enriquecido) + nombre de los archivos adjuntos.
// No indexa el CONTENIDO de los archivos (PDF/Word/etc.) — eso requeriría
// extraer texto de cada formato, fuera de alcance de un filtro simple.
export function matchesTaskSearch(
  task: { title: string; description: string | null; attachments: { fileName: string }[] },
  query: string | undefined
) {
  if (!query) return true;
  const needle = normalizeSearchText(query.trim());
  if (!needle) return true;

  const haystack = normalizeSearchText(
    [task.title, task.description?.replace(/<[^>]*>/g, " ") ?? "", ...task.attachments.map((a) => a.fileName)].join(" ")
  );
  return haystack.includes(needle);
}
