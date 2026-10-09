import { prisma } from "@/lib/prisma";
import { getProjectAdmin, LIVE_PROJECT_WHERE, type Actor } from "@/lib/permissions";
import { parentLinkError } from "@/lib/subprojects";

/**
 * Spec 004: ¿se puede crear un proyecto NUEVO como subproyecto de `parentId`? Misma regla en la app
 * («+ Nuevo subproyecto»), la API (POST /projects con parentId) y el chat. Devuelve el motivo o null.
 */
export async function newSubprojectParentError(parentId: string, actor?: Actor): Promise<string | null> {
  if (!(await getProjectAdmin(parentId, actor))) return "Solo el PM del proyecto principal o un administrador pueden crear subproyectos.";
  const parent = await prisma.project.findFirst({ where: { id: parentId, ...LIVE_PROJECT_WHERE }, select: { id: true, parentId: true } });
  return parentLinkError({ id: "", parentId: null, childrenCount: 0 }, parent ? { ...parent, live: true } : null);
}
