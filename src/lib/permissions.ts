import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Punto 3 (manuscrito): el PM de un proyecto tiene control de administrador
 * sobre ESE proyecto, sin importar su rol global. Un ADMIN global siempre
 * pasa. Devuelve el usuario si tiene permiso, o null si no.
 */
export async function getProjectAdmin(projectId: string) {
  const session = await auth();
  if (!session?.user) return null;
  if (session.user.role === "ADMIN") return session.user;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (project?.pmId === session.user.id) return session.user;
  return null;
}

export async function requireProjectAdmin(projectId: string) {
  const user = await getProjectAdmin(projectId);
  if (!user) throw new Error("Solo el PM de este proyecto o un administrador pueden hacer esto.");
  return user;
}

/**
 * Punto 1 (extendido): editar una tarea — estado, título, descripción, tipo,
 * fase, checklist, asignación, insumos/evidencia — lo puede hacer un
 * asignado, el PM del proyecto, o un admin. Quedan afuera (solo PM/admin):
 * borrar la tarea, sus predecesoras/dependencias, eliminar adjuntos, y las
 * definiciones del proyecto (objetivos/requisitos/fases).
 */
export async function canEditTask(taskId: string) {
  const session = await auth();
  if (!session?.user) return false;
  if (session.user.role === "ADMIN") return true;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: true, assignees: true },
  });
  if (!task) return false;
  if (task.project.pmId === session.user.id) return true;
  return task.assignees.some((a) => a.userId === session.user.id);
}
