import { prisma } from "@/lib/prisma";

// Spec 004: «Contribuye a» — un objetivo de un subproyecto puede aportar a un objetivo de su proyecto principal.
// Sin el campo en el formulario (proyecto sin principal) no se toca; vacío = sin ligar.
export async function parentObjectiveFrom(projectId: string, formData: FormData): Promise<{ value?: string | null; error?: string }> {
  if (!formData.has("parentObjectiveId")) return {};
  const raw = String(formData.get("parentObjectiveId") ?? "");
  if (!raw) return { value: null };
  const [project, target] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { parentId: true } }),
    prisma.objective.findUnique({ where: { id: raw }, select: { projectId: true } }),
  ]);
  if (!project?.parentId || target?.projectId !== project.parentId) return { error: "Ese objetivo no pertenece al proyecto principal." };
  return { value: raw };
}
