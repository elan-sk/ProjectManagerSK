// Búsqueda de texto tipo buscador de correo: título + descripción (se le
// saca el HTML del editor enriquecido) + nombre de los archivos adjuntos.
// No indexa el CONTENIDO de los archivos (PDF/Word/etc.) — eso requeriría
// extraer texto de cada formato, fuera de alcance de un filtro simple.
export function matchesTaskSearch(
  task: { title: string; description: string | null; attachments: { fileName: string }[] },
  query: string | undefined
) {
  if (!query) return true;
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  const haystack = [task.title, task.description?.replace(/<[^>]*>/g, " ") ?? "", ...task.attachments.map((a) => a.fileName)]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}
