import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Quien actúa: normalmente la sesión del navegador (auth()), pero la API
// pública (login por usuario/contraseña, ver apiAuth.ts) resuelve su propio
// actor y lo pasa explícito acá — mismas reglas de permiso para los dos,
// sin duplicar lógica.
export type Actor = { id: string; role: string };

async function resolveActor(actor?: Actor): Promise<Actor | null> {
  if (actor) return actor;
  const session = await auth();
  return session?.user ? { id: session.user.id, role: session.user.role } : null;
}

/**
 * Punto 3 (manuscrito): el PM de un proyecto tiene control de administrador
 * sobre ESE proyecto, sin importar su rol global. Un ADMIN global siempre
 * pasa. Devuelve el usuario si tiene permiso, o null si no.
 */
export async function getProjectAdmin(projectId: string, actor?: Actor) {
  const user = await resolveActor(actor);
  if (!user) return null;
  if (user.role === "ADMIN") return user;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (project?.pmId === user.id) return user;
  return null;
}

export async function requireProjectAdmin(projectId: string, actor?: Actor) {
  const user = await getProjectAdmin(projectId, actor);
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
export async function canEditTask(taskId: string, actor?: Actor) {
  const user = await resolveActor(actor);
  if (!user) return false;
  if (user.role === "ADMIN") return true;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: true, assignees: true },
  });
  if (!task) return false;
  if (task.project.pmId === user.id) return true;
  return task.assignees.some((a) => a.userId === user.id);
}

/**
 * Punto 2.6: en una tarea tipo Revisión, cargar checks/resultados/evidencia
 * y cerrar una ronda lo puede hacer un revisor (TaskReviewer) de esa tarea,
 * el PM del proyecto, o un admin — distinto de canEditTask (que mira
 * TaskAssignee, los ejecutores).
 */
export async function canReviewTask(taskId: string, actor?: Actor) {
  const user = await resolveActor(actor);
  if (!user) return false;
  if (user.role === "ADMIN") return true;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: true, reviewers: true },
  });
  if (!task) return false;
  if (task.project.pmId === user.id) return true;
  return task.reviewers.some((r) => r.userId === user.id);
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

/**
 * Quien puede participar en la conversación de un proyecto o de una de sus
 * tareas (escribir y responder preguntas): admin, PM del proyecto, o quien es
 * asignado o revisor de la tarea (o de cualquier tarea del proyecto, si la
 * conversación es la del proyecto). Misma regla de las conversaciones internas.
 */
export async function canParticipateInProject(projectId: string, taskId?: string | null, actor?: Actor) {
  const user = await resolveActor(actor);
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { pmId: true } });
  if (project?.pmId === user.id) return true;
  const scope = taskId ? { id: taskId } : { projectId };
  const member = await prisma.task.findFirst({
    where: { ...scope, OR: [{ assignees: { some: { userId: user.id } } }, { reviewers: { some: { userId: user.id } } }] },
    select: { id: true },
  });
  return Boolean(member);
}

/** Quién actúa, con nombre para firmar lo que escriba: la sesión del navegador o el usuario de la API. */
export async function getActingUser(actor?: Actor) {
  if (actor) return prisma.user.findUnique({ where: { id: actor.id }, select: { id: true, name: true, role: true } });
  const session = await auth();
  return session?.user ? { id: session.user.id, name: session.user.name ?? null, role: session.user.role } : null;
}
