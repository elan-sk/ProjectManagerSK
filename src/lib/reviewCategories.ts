import { prisma } from "@/lib/prisma";

// Categorías ya usadas en plantillas de Pruebas (QA) y en características de
// Aceptación/Pruebas (ReviewCheck) — sin catálogo aparte: lo que se escribe de
// un lado queda disponible como sugerencia (<datalist>, no obliga) del otro.
export async function getKnownCategories(): Promise<string[]> {
  const [templateCats, checkCats] = await Promise.all([
    prisma.testTemplateItem.findMany({ where: { category: { not: null } }, select: { category: true }, distinct: ["category"] }),
    prisma.reviewCheck.findMany({ where: { category: { not: null } }, select: { category: true }, distinct: ["category"] }),
  ]);
  const set = new Set<string>();
  for (const c of [...templateCats, ...checkCats]) if (c.category) set.add(c.category);
  return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
}
