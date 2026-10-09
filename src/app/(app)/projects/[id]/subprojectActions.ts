"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getProjectAdmin, LIVE_PROJECT_WHERE, type Actor } from "@/lib/permissions";
import { parentLinkError } from "@/lib/subprojects";

// Spec 004: vincular un proyecto existente como subproyecto o quitarlo del grupo.
type Result = { ok: true } | { ok: false; error: string };
const NO_PARENT = "Solo el PM del proyecto principal o un administrador pueden administrar sus subproyectos.";

function refresh(...ids: (string | null | undefined)[]) {
  for (const id of ids) if (id) revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
  revalidatePath("/agenda");
}

/**
 * Fija (`parentId`) o quita (`null`) el proyecto principal de `projectId`.
 * Vincular: hay que administrar los dos proyectos. Quitar: solo quien administra el principal (RF-13).
 */
export async function setProjectParent(projectId: string, parentId: string | null, actor?: Actor): Promise<Result> {
  try {
    const child = await prisma.project.findFirst({
      where: { id: projectId, ...LIVE_PROJECT_WHERE },
      select: { id: true, parentId: true, _count: { select: { children: true } } },
    });
    if (!child) return { ok: false, error: "El proyecto no existe o no está activo." };

    if (parentId === null) {
      if (!child.parentId) return { ok: true };
      if (!(await getProjectAdmin(child.parentId, actor))) return { ok: false, error: NO_PARENT };
      const formerParentId = child.parentId;
      await prisma.$transaction([
        prisma.project.update({ where: { id: projectId }, data: { parentId: null } }),
        // Sus objetivos dejan de aportar a los del principal (RF-12).
        prisma.objective.updateMany({ where: { projectId }, data: { parentObjectiveId: null } }),
      ]);
      refresh(projectId, formerParentId);
      return { ok: true };
    }

    if (!(await getProjectAdmin(parentId, actor))) return { ok: false, error: NO_PARENT };
    if (!(await getProjectAdmin(projectId, actor))) return { ok: false, error: "Para vincularlo hay que poder administrar también ese proyecto." };
    const parent = await prisma.project.findFirst({ where: { id: parentId, ...LIVE_PROJECT_WHERE }, select: { id: true, parentId: true } });
    const error = parentLinkError({ id: child.id, parentId: child.parentId, childrenCount: child._count.children }, parent ? { ...parent, live: true } : null);
    if (error) return { ok: false, error };
    await prisma.project.update({ where: { id: projectId }, data: { parentId } });
    refresh(projectId, parentId);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo actualizar el grupo de proyectos. Intente de nuevo." };
  }
}
