import { prisma } from "@/lib/prisma";

// Punto 17: encuentra la etiqueta ya creada en este proyecto bajo esta
// categoría con este nombre, o la crea — compartido entre setTaskTag
// (agregar una etiqueta a una tarea ya existente) y addTask (etiquetas
// elegidas desde la creación), para no repetir el mismo upsert en dos
// archivos "use server" distintos.
export async function upsertTag(projectId: string, categoryId: string, name: string) {
  return prisma.tag.upsert({
    where: { projectId_categoryId_name: { projectId, categoryId, name } },
    create: { projectId, categoryId, name },
    update: {},
  });
}

// El filtro "Etiqueta" (ComboFilter) es un único <select> con un solo
// paramKey ("tag") — para que pueda elegir tanto una etiqueta concreta como
// "toda la categoría", el valor de una categoría se codifica con este
// prefijo en la URL (ej. tag=cat:xyz). Un id de Tag real nunca empieza así
// (son cuid), así que no hay colisión posible.
const TAG_FILTER_CATEGORY_PREFIX = "cat:";

export function categoryFilterValue(categoryId: string) {
  return `${TAG_FILTER_CATEGORY_PREFIX}${categoryId}`;
}

// Compartido entre projects/page.tsx (panorama general) y
// projects/[id]/page.tsx (un proyecto puntual) para no repetir la misma
// lógica de "categoría completa vs. etiqueta puntual" en los dos archivos.
export function matchesTagFilter(filterValue: string | undefined, taskTags: { tagId: string; categoryId: string }[]) {
  if (!filterValue) return true;
  if (filterValue.startsWith(TAG_FILTER_CATEGORY_PREFIX)) {
    const categoryId = filterValue.slice(TAG_FILTER_CATEGORY_PREFIX.length);
    return taskTags.some((tt) => tt.categoryId === categoryId);
  }
  return taskTags.some((tt) => tt.tagId === filterValue);
}

// Arma las opciones del ComboFilter "Etiqueta": para cada categoría con al
// menos una etiqueta usada en el alcance visible (un proyecto, o todos los
// visibles en el panorama general), primero la opción "toda la categoría" y
// después cada etiqueta puntual — así quedan agrupadas visualmente aunque el
// ComboFilter sea una lista plana.
//
// El punto de color usa `dotColorHex` (estilo inline), NO una clase Tailwind
// armada con el hex (`bg-[${hex}]`): Tailwind solo genera CSS para clases que
// puede leer como texto literal en el código fuente, así que una clase
// interpolada en tiempo de ejecución con un color que viene de la base de
// datos nunca se compila — queda invisible y solo se ve el hueco vacío del
// punto (bug real, reportado por el usuario como "espacio raro"). Mismo
// criterio que TagChip: si la categoría tiene emoji no hace falta el punto
// (el emoji ya identifica la categoría), evita mostrar los dos a la vez.
export function buildTagFilterOptions(
  categories: { id: string; name: string; colorHex: string; emoji: string | null }[],
  tags: { id: string; categoryId: string; name: string }[]
) {
  const usedCategoryIds = new Set(tags.map((t) => t.categoryId));
  return categories
    .filter((c) => usedCategoryIds.has(c.id))
    .flatMap((c) => [
      {
        id: categoryFilterValue(c.id),
        label: c.emoji ? `${c.emoji} ${c.name} (todas)` : `${c.name} (todas)`,
        dotColorHex: c.emoji ? undefined : c.colorHex,
      },
      ...tags
        .filter((t) => t.categoryId === c.id)
        .map((t) => ({
          id: t.id,
          label: c.emoji ? `${c.emoji} ${c.name}: ${t.name}` : `${c.name}: ${t.name}`,
          dotColorHex: c.emoji ? undefined : c.colorHex,
        })),
    ]);
}
