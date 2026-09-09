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
