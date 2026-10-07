import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveActor, visibleProjectWhere, type Actor } from "@/lib/permissions";
import { decryptPassword } from "@/lib/credentialCrypto";
import type { CredentialEventName } from "@/lib/credentialPlace";

/**
 * Fuente única de quién ve una credencial (lista, galería, buscador, API, bot, avisos). Además de
 * poder ver el proyecto (ocultos incluidos: solo su admin-PM), alcanza con UNA de estas:
 *  - la creó;
 *  - visibilidad «Todos»;
 *  - es asignado de una tarea donde se agregó la credencial (regla del usuario: quien la agrega a una
 *    tarea da acceso a sus asignados);
 *  - «Personas concretas» y está marcado;
 *  - «Solo los del proyecto» y es administrador, PM del proyecto, o asignado/revisor de alguna tarea.
 */
export function credentialVisibleWhere(user: Actor): Prisma.CredentialWhereInput {
  const uid = user.id;
  const projectMember: Prisma.ProjectWhereInput = {
    OR: [{ pmId: uid }, { tasks: { some: { OR: [{ assignees: { some: { userId: uid } } }, { reviewers: { some: { userId: uid } } }] } } }],
  };
  return {
    project: visibleProjectWhere(user, { includeArchived: true }),
    OR: [
      { createdById: uid },
      { visibility: "ALL" },
      { tasks: { some: { task: { assignees: { some: { userId: uid } } } } } },
      { visibility: "USERS", allowedUsers: { some: { userId: uid } } },
      user.role === "ADMIN" ? { visibility: "PROJECT" } : { visibility: "PROJECT", project: projectMember },
    ],
  };
}

export async function canSeeCredential(credentialId: string, actor?: Actor) {
  const user = await resolveActor(actor);
  if (!user) return null;
  const credential = await prisma.credential.findFirst({ where: { id: credentialId, ...credentialVisibleWhere(user) }, select: { id: true } });
  return credential ? user : null;
}

/** Editar o borrar: quien la creó, el PM del proyecto o un administrador — siempre que la pueda ver. */
export async function canManageCredential(credentialId: string, actor?: Actor) {
  const user = await canSeeCredential(credentialId, actor);
  if (!user) return null;
  const c = await prisma.credential.findUniqueOrThrow({ where: { id: credentialId }, select: { createdById: true, project: { select: { pmId: true } } } });
  return user.role === "ADMIN" || c.project.pmId === user.id || c.createdById === user.id ? user : null;
}

/**
 * Ids de las personas activas que hoy pueden ver la credencial (destinatarios de los avisos).
 * Usa la misma regla que credentialVisibleWhere para no tener dos versiones de la verdad.
 * ponytail: una consulta por usuario activo — el equipo es chico; si crece, armar el conjunto en SQL.
 */
export async function credentialAudienceIds(credentialId: string): Promise<string[]> {
  const users = await prisma.user.findMany({ where: { active: true }, select: { id: true, role: true } });
  const visible = await Promise.all(
    users.map(async (u) => ((await prisma.credential.count({ where: { id: credentialId, ...credentialVisibleWhere(u) } })) > 0 ? u.id : null))
  );
  return visible.filter((id): id is string => id !== null);
}

export const CREDENTIAL_VISIBILITY_LABEL = {
  ALL: "Todos los usuarios",
  PROJECT: "Solo los del proyecto",
  USERS: "Personas concretas",
} as const;

/** Forma pública de una credencial para la API (incluye la contraseña: decisión del usuario, solo a quien tiene acceso). */
export function credentialForApi(c: {
  id: string;
  projectId: string;
  name: string;
  url: string | null;
  username: string | null;
  passwordEnc: string;
  notes: string | null;
  visibility: string;
  createdAt: Date;
  tasks?: { taskId: string }[];
  allowedUsers?: { userId: string }[];
}) {
  return {
    id: c.id,
    projectId: c.projectId,
    name: c.name,
    url: c.url,
    username: c.username,
    password: decryptPassword(c.passwordEnc),
    notes: c.notes,
    visibility: c.visibility,
    taskIds: c.tasks?.map((t) => t.taskId) ?? [],
    allowedUserIds: c.allowedUsers?.map((u) => u.userId) ?? [],
    createdAt: c.createdAt,
  };
}

/**
 * Historial de acceso (pedido del usuario): una fila por contraseña y evento, con el nombre de quien
 * accedió guardado aparte (sobrevive si se elimina el usuario). Nunca bloquea: si falla, solo se registra.
 */
export async function logCredentialAccess(credentialIds: string[], actor: Actor, event: CredentialEventName, source: "app" | "api") {
  if (credentialIds.length === 0) return;
  try {
    const user = await prisma.user.findUnique({ where: { id: actor.id }, select: { name: true } });
    await prisma.credentialAccessLog.createMany({
      data: credentialIds.map((credentialId) => ({ credentialId, userId: actor.id, userName: user?.name ?? "Usuario eliminado", event, source })),
    });
  } catch (err) {
    console.error("[contraseñas] no se pudo registrar el acceso", err);
  }
}
