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
  // Estos tres también devuelven tareas, por eso van junto a «Tareas»: las de un tipo (Prueba, Ajuste…), un estado o las que llevan una etiqueta.
  { prefix: "tipos", kind: "taskType", label: "Tipo de tarea" },
  { prefix: "estados", kind: "taskStatus", label: "Estado de tarea" },
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

export type SearchSegment = { filter: HeaderSearchFilter; text: string };

// Un tramo todavía a medio escribir: vacío (recién puesto «&» o «|») o el comienzo de un filtro («pro»).
const isPartialFilter = (piece: string) => {
  const word = normalizeSearchText(piece.trim());
  return !word || (!/[\s:]/.test(word) && HEADER_SEARCH_OPTIONS.some((o) => normalizeSearchText(o.prefix).startsWith(word)));
};

// Filtros combinados: «etiquetas:sprint:&proyecto:racafe:» (Y) y «estados:hecho:|estados:revisión:» (O); «&» pesa
// más que «|»: «a&b|c» = (a y b) o c. Devuelve los grupos O, cada uno con sus filtros Y. Solo es combinada si
// arranca con un filtro y cada tramo es un filtro o uno a medio escribir (este no filtra): así un «&» dentro
// de un texto («clave:https://x.com?a=1&b=2») sigue siendo texto.
export function parseCombinedSearch(query: string): SearchSegment[][] | null {
  if (!/[&|]/.test(query)) return null;
  const groups = query.split("|").map((group) => group.split("&"));
  const pieces = groups.flat();
  if (!parseHeaderSearch(pieces[0]).filter || !pieces.every((p) => parseHeaderSearch(p).filter || isPartialFilter(p))) return null;
  return groups
    .map((group) => group.map(parseHeaderSearch).filter((s): s is SearchSegment => s.filter !== null))
    .filter((group) => group.length > 0);
}

// Lo ya escrito hasta el último «&»/«|» de una consulta combinada y el tramo que se está escribiendo (el
// que reciben las sugerencias y Tab). En una consulta simple, todo es el tramo.
export function splitActiveSegment(query: string) {
  if (!parseCombinedSearch(query)) return { head: "", piece: query };
  const at = Math.max(query.lastIndexOf("&"), query.lastIndexOf("|")) + 1;
  return { head: query.slice(0, at), piece: query.slice(at) };
}

// Qué devuelve un grupo Y: etiquetas, tipos, estados y tareas dan tareas; si solo tiene «proyecto:» da esos
// proyectos, y junto a otro filtro «proyecto:» restringe a los de ese proyecto. Dos tipos distintos
// («archivos:&comentarios:») no dan nada.
// Excepción, manda el orden: «proyectos:x» PRIMERO y luego solo condiciones de tarea («proyectos:panaca&tareas:melo»)
// da los proyectos que tienen alguna tarea que las cumple; al revés («tareas:melo&proyectos:panaca»), esas tareas.
const TASK_FILTERS = new Set<HeaderSearchFilter>(["task", "tag", "taskType", "taskStatus"]);
export function isProjectWithTaskGroup(group: SearchSegment[]) {
  return group[0]?.filter === "project" && group.some((s) => s.filter !== "project") && group.every((s) => s.filter === "project" || TASK_FILTERS.has(s.filter));
}

export function combinedGroupKind(group: SearchSegment[]) {
  if (isProjectWithTaskGroup(group)) return "project";
  const kinds = new Set(group.flatMap(({ filter }) =>
    filter === "project" ? [] : filter === "tag" || filter === "taskType" || filter === "taskStatus" ? ["task"] : [filter]));
  return kinds.size > 1 ? null : ([...kinds][0] ?? "project");
}

// «valor:texto» de tipos, estados y proyecto: antes de los dos puntos lo que se elige y después lo que se
// busca dentro de sus resultados.
export function splitFilterValue(text: string) {
  const colon = text.indexOf(":");
  return colon < 0 ? { value: text.trim(), content: "" } : { value: text.slice(0, colon).trim(), content: text.slice(colon + 1).trim() };
}

// «etiquetas:Categoría:nombre:texto» — antes de los dos puntos la categoría y después el nombre (cualquiera
// de los dos puede ir vacío; sin dos puntos, `category` y `name` son null y el texto se busca en
// «Categoría | nombre» completo). Lo que va después de un tercer «:» se busca en el contenido de las tareas;
// con un espacio justo después de «categoría:» («etiquetas:capacitación: figma») se salta la etiqueta y se
// busca directo en el contenido de las tareas de la categoría.
export function parseTagSegment(text: string) {
  const colon = text.indexOf(":");
  if (colon < 0) return { text, category: null, name: null, content: "" };
  const rest = text.slice(colon + 1);
  const restColon = rest.indexOf(":");
  const rawName = restColon < 0 ? rest : rest.slice(0, restColon);
  const content = restColon < 0 ? "" : rest.slice(restColon + 1).trim();
  const category = text.slice(0, colon).trim();
  if (/^\s/.test(rawName)) return { text, category, name: "", content: [rawName.trim(), content].filter(Boolean).join(" ") };
  return { text, category, name: rawName.trim(), content };
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
