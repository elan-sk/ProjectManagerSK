import { prisma } from "@/lib/prisma";

export const REQUIREMENT_NOT_IN_PROJECT = "Alguno de los requerimientos no pertenece a este proyecto.";

export async function requirementsForProject(requirementIds: string[] | null | undefined, projectId: string) {
  const ids = [...new Set(requirementIds ?? [])];
  if (ids.length === 0) return { ok: true as const, requirementIds: ids };
  const valid = await prisma.requirement.count({ where: { id: { in: ids }, projectId } });
  if (valid !== ids.length) return { ok: false as const, error: REQUIREMENT_NOT_IN_PROJECT };
  return { ok: true as const, requirementIds: ids };
}
