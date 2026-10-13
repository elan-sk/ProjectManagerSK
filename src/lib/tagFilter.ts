// El filtro "Etiqueta" (ComboFilter) es un único <select> con un solo
// paramKey ("tag") — para que pueda elegir tanto una etiqueta concreta como
// "toda la categoría", el valor de una categoría se codifica con este
// prefijo en la URL (ej. tag=cat:xyz). Un id de Tag real nunca empieza así
// (son cuid), así que no hay colisión posible. Sin Prisma: lo usa también TagChip (cliente).
export const TAG_FILTER_CATEGORY_PREFIX = "cat:";

// Texto de una etiqueta fuera de su ficha (bot, buscador): «Categoría | etiqueta», o solo la categoría.
export function tagLabel(category: { name: string; emoji: string | null }, name: string) {
  return `${category.emoji ? `${category.emoji} ` : ""}${category.name}${name ? ` | ${name}` : ""}`;
}

export function categoryFilterValue(categoryId: string) {
  return `${TAG_FILTER_CATEGORY_PREFIX}${categoryId}`;
}
