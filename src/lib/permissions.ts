import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Quien actúa: normalmente la sesión del navegador (auth()), pero la API
// pública (login por usuario/contraseña, ver apiAuth.ts) resuelve su propio
// actor y lo pasa explícito acá — mismas reglas de permiso para los dos,
// sin duplicar lógica.
export type Actor = { id: string; role: string };

// Seguridad: las server actions ("use server") las puede invocar el navegador con
// cualquier argumento, así que un `actor` que llega por parámetro NO se cree por
// sí solo — un miembro podría mandar { role: "ADMIN" }. Solo vale el actor que el
// propio servidor creó y marcó con trustedActor() (token de la API, link
// "Conectar IA", chat); cualquier otro se ignora y manda la sesión real.
const trustedActors = new WeakSet<object>();

export function trustedActor(actor: Actor): Actor {
  trustedActors.add(actor);
  return actor;
}

export async function resolveActor(actor?: Actor): Promise<Actor | null> {
  if (actor && typeof actor === "object" && trustedActors.has(actor)) return actor;
  const session = await auth();
  return session?.user ? { id: session.user.id, role: session.user.role } : null;
}

/**
 * Proyecto oculto: solo lo ve (y lo toca) un administrador que ADEMÁS es su
 * responsable (PM). Un segundo administrador, o un PM que no sea administrador,
 * no lo ven ni por la app, ni por la API, ni por el chat, ni por avisos.
 */
export function canSeeProject(project: { hidden: boolean } & PmScope, user: Actor) {
  return !project.hidden || (user.role === "ADMIN" && isProjectPm(project, user.id));
}

/**
 * Subproyectos (spec 004): el PM del proyecto padre es PM, a efectos de permisos, de cada hijo.
 * Al revés no: el PM de un hijo no administra al padre ni a los otros hijos.
 */
export type PmScope = { pmId: string; parent?: { pmId: string } | null };
export function isProjectPm(project: PmScope, userId: string) {
  return project.pmId === userId || project.parent?.pmId === userId;
}
/** Select mínimo para canSeeProject / isProjectPm (incluye al PM del padre). */
export const PM_SCOPE_SELECT = { hidden: true, pmId: true, parent: { select: { pmId: true } } } as const;
/** Filtro de Prisma: proyectos que esta persona administra como PM (propios + hijos de los suyos). */
export function managedProjectWhere(userId: string) {
  return { OR: [{ pmId: userId }, { parent: { pmId: userId } }] };
}

/** Proyectos del flujo normal: ni eliminados (status ARCHIVED) ni archivados como historial (archivedAt). */
export const LIVE_PROJECT_WHERE = { status: { not: "ARCHIVED" as const }, archivedAt: null };

/**
 * Filtro de Prisma para consultas de proyectos: deja fuera los ocultos que esa persona no puede ver,
 * los eliminados y, salvo `includeArchived`, los archivados (historial).
 */
export function visibleProjectWhere(user: Actor, { includeArchived = false } = {}) {
  const live = includeArchived ? { status: LIVE_PROJECT_WHERE.status } : LIVE_PROJECT_WHERE;
  // Oculto ajeno = oculto cuyo PM no es esta persona, ni lo es el PM de su padre (spec 004).
  return user.role === "ADMIN"
    ? { NOT: { hidden: true, pmId: { not: user.id }, OR: [{ parentId: null }, { parent: { pmId: { not: user.id } } }] }, ...live }
    : { hidden: false, ...live };
}

/**
 * Punto 3 (manuscrito): el PM de un proyecto tiene control de administrador
 * sobre ESE proyecto, sin importar su rol global. Un ADMIN global siempre
 * pasa. Devuelve el usuario si tiene permiso, o null si no.
 */
export async function getProjectAdmin(projectId: string, actor?: Actor) {
  const user = await resolveActor(actor);
  if (!user) return null;

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: PM_SCOPE_SELECT });
  if (!project || !canSeeProject(project, user)) return null;
  if (user.role === "ADMIN" || isProjectPm(project, user.id)) return user;
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

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { select: PM_SCOPE_SELECT }, assignees: true },
  });
  if (!task || !canSeeProject(task.project, user)) return false;
  if (user.role === "ADMIN" || isProjectPm(task.project, user.id)) return true;
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

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { select: PM_SCOPE_SELECT }, reviewers: true },
  });
  if (!task || !canSeeProject(task.project, user)) return false;
  if (user.role === "ADMIN" || isProjectPm(task.project, user.id)) return true;
  return task.reviewers.some((r) => r.userId === user.id);
}

/**
 * Punto 2.6.1: crear una plantilla de pruebas o categoría de respuesta NUEVA
 * (el contenedor) requiere tener permiso de revisor en algún lado — admin,
 * PM de algún proyecto, o revisor asignado en al menos una tarea. Agregar un
 * ítem DENTRO de una plantilla/categoría ya existente sigue abierto a
 * cualquiera (no pasa por acá).
 */
export async function isReviewerAnywhere(actor?: Actor) {
  const user = await resolveActor(actor);
  if (!user) return false;
  if (user.role === "ADMIN") return true;

  const [pmOf, reviewerOf] = await Promise.all([
    prisma.project.findFirst({ where: { pmId: user.id } }),
    prisma.taskReviewer.findFirst({ where: { userId: user.id } }),
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
export async function isPmOrAdminAnywhere(actor?: Actor) {
  const user = await resolveActor(actor);
  if (!user) return false;
  if (user.role === "ADMIN") return true;

  const pmOf = await prisma.project.findFirst({ where: { pmId: user.id } });
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
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: PM_SCOPE_SELECT });
  if (!project || !canSeeProject(project, user)) return false;
  if (user.role === "ADMIN" || isProjectPm(project, user.id)) return true;
  const scope = taskId ? { id: taskId } : { projectId };
  const member = await prisma.task.findFirst({
    where: { ...scope, OR: [{ assignees: { some: { userId: user.id } } }, { reviewers: { some: { userId: user.id } } }] },
    select: { id: true },
  });
  return Boolean(member);
}

/**
 * Excepción a "un asignado no puede ser su propio revisor": en un proyecto con
 * una sola persona con acceso no hay nadie más que revise. Vale si el proyecto
 * es oculto (solo lo ve su PM) o si su PM es la única persona en él: ninguna
 * tarea tiene otro asignado/revisor y `userIds` (la asignación nueva) tampoco.
 */
export async function allowsSelfReview(projectId: string, userIds: string[]) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { hidden: true, pmId: true } });
  if (!project) return false;
  if (project.hidden) return true;
  if (userIds.some((id) => id !== project.pmId)) return false;
  const other = await prisma.task.findFirst({
    where: {
      projectId,
      OR: [{ assignees: { some: { userId: { not: project.pmId } } } }, { reviewers: { some: { userId: { not: project.pmId } } } }],
    },
    select: { id: true },
  });
  return !other;
}

/** Quién actúa, con nombre para firmar lo que escriba: la sesión del navegador o el usuario de la API. */
export async function getActingUser(actor?: Actor) {
  const user = await resolveActor(actor);
  return user ? prisma.user.findUnique({ where: { id: user.id }, select: { id: true, name: true, role: true } }) : null;
}
