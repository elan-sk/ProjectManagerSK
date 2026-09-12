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

/**
 * Punto 2.6: en una tarea tipo Revisión, cargar checks/resultados/evidencia
 * y cerrar una ronda lo puede hacer un revisor (TaskReviewer) de esa tarea,
 * el PM del proyecto, o un admin — distinto de canEditTask (que mira
 * TaskAssignee, los ejecutores).
 */
export async function canReviewTask(taskId: string) {
  const session = await auth();
  if (!session?.user) return false;
  if (session.user.role === "ADMIN") return true;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: true, reviewers: true },
  });
  if (!task) return false;
  if (task.project.pmId === session.user.id) return true;
  return task.reviewers.some((r) => r.userId === session.user.id);
}

/**
 * Punto 2.6.1: crear una plantilla de pruebas o categoría de respuesta NUEVA
 * (el contenedor) requiere tener permiso de revisor en algún lado — admin,
 * PM de algún proyecto, o revisor asignado en al menos una tarea. Agregar un
 * ítem DENTRO de una plantilla/categoría ya existente sigue abierto a
 * cualquiera (no pasa por acá).
 */
export async function isReviewerAnywhere() {
  const session = await auth();
  if (!session?.user) return false;
  if (session.user.role === "ADMIN") return true;

  const [pmOf, reviewerOf] = await Promise.all([
    prisma.project.findFirst({ where: { pmId: session.user.id } }),
    prisma.taskReviewer.findFirst({ where: { userId: session.user.id } }),
  ]);
  return Boolean(pmOf || reviewerOf);
}

/**
 * Punto 17: crear una categoría de etiqueta NUEVA (global, visible en todos
 * los proyectos) requiere ser admin o PM de algún proyecto — mismo criterio
 * de "quién decide algo que se ve en toda la app" que ya usa
 * isReviewerAnywhere para plantillas de pruebas, pero sin el caso de
 * revisor (acá no tiene que ver con revisiones).
 */
export async function isPmOrAdminAnywhere() {
  const session = await auth();
  if (!session?.user) return false;
  if (session.user.role === "ADMIN") return true;

  const pmOf = await prisma.project.findFirst({ where: { pmId: session.user.id } });
  return Boolean(pmOf);
}
