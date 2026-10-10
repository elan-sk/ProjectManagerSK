"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canEditTask, getProjectAdmin, resolveActor, type Actor } from "@/lib/permissions";
import { encryptPassword, decryptPassword } from "@/lib/credentialCrypto";
import { canManageCredential, canSeeCredential, credentialAudienceIds, credentialVisibleWhere, logCredentialAccess } from "@/lib/credentials";
import { notifyCredentialShared } from "@/lib/notifications";
import type { CredentialEventName, CredentialPlace } from "@/lib/credentialPlace";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fieldsSchema = z.object({
  name: z.string().trim().min(1, "Falta indicar el nombre de la contraseña.").max(120, "El nombre es demasiado largo."),
  url: z.string().trim().max(2000).optional().default(""),
  username: z.string().trim().max(190, "El usuario es demasiado largo.").optional().default(""),
  notes: z.string().trim().max(5000).optional().default(""),
  visibility: z.enum(["ALL", "PROJECT", "USERS"]).default("PROJECT"),
  userIds: z.array(z.string()).optional().default([]),
});

export type CredentialInput = z.input<typeof fieldsSchema> & { password?: string };

function firstError(err: z.ZodError) {
  return err.issues[0]?.message ?? "Revise los datos de la contraseña.";
}

// Refrescar la caché nunca bloquea la acción ya guardada (fuera de una petición de Next — scripts,
// chequeos — revalidatePath falla).
function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch (err) {
    if (process.env.NODE_ENV === "production") console.error("[contraseñas] no se pudo refrescar", path, err);
  }
}

function revalidateCredentialPaths(projectId: string, taskIds: string[] = []) {
  safeRevalidate(`/projects/${projectId}`);
  for (const taskId of taskIds) safeRevalidate(`/projects/${projectId}/tasks/${taskId}`);
}

/** Avisa solo a quienes ganaron acceso respecto de `before` (al crear, `before` vacío = todos). */
async function notifyNewAudience(credentialId: string, before: string[], actorId: string) {
  const after = await credentialAudienceIds(credentialId);
  const known = new Set(before);
  await notifyCredentialShared(
    credentialId,
    after.filter((id) => !known.has(id)),
    actorId
  ).catch((err) => console.error("[contraseñas] no se pudo avisar", err));
}

type ResolvedPlace = { projectId: string; taskId: string | null; stepId: string | null; adjustmentItemId: string | null };

/**
 * Resuelve el lugar (proyecto, tarea, paso o ajuste) y valida el permiso: en el proyecto, PM o
 * administrador (mismo permiso que subir insumos del proyecto); en una tarea, paso o ajuste, quien
 * puede editar esa tarea. Un paso o ajuste siempre arrastra su tarea: la contraseña queda también en
 * los insumos de la tarea, y así sus asignados la ven (igual que los archivos de un paso).
 */
async function resolvePlace(place: CredentialPlace, actor?: Actor): Promise<ResolvedPlace | { error: string }> {
  if ("projectId" in place) {
    if (!(await getProjectAdmin(place.projectId, actor))) return { error: "Solo el PM del proyecto o un administrador pueden agregar contraseñas al proyecto." };
    return { projectId: place.projectId, taskId: null, stepId: null, adjustmentItemId: null };
  }
  let taskId: string;
  let stepId: string | null = null;
  let adjustmentItemId: string | null = null;
  if ("taskId" in place) taskId = place.taskId;
  else if ("stepId" in place) {
    const step = await prisma.taskStep.findUnique({ where: { id: place.stepId }, select: { taskId: true } });
    if (!step) return { error: "Ese paso ya no existe." };
    taskId = step.taskId;
    stepId = place.stepId;
  } else {
    const item = await prisma.adjustmentItem.findUnique({ where: { id: place.adjustmentItemId }, select: { taskId: true } });
    if (!item) return { error: "Ese ajuste ya no existe." };
    taskId = item.taskId;
    adjustmentItemId = place.adjustmentItemId;
  }
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
  if (!task || !(await canEditTask(taskId, actor))) return { error: "No tiene permiso para agregar contraseñas a esta tarea." };
  return { projectId: task.projectId, taskId, stepId, adjustmentItemId };
}

/** Crea una contraseña en el proyecto, o como insumo de una tarea, un paso del checklist o un ajuste. */
export async function createCredential(input: CredentialInput, place: CredentialPlace, actor?: Actor): Promise<Result<{ id: string }>> {
  const user = await resolveActor(actor);
  if (!user) return { ok: false, error: "La sesión terminó. Vuelva a iniciar sesión." };
  const where = await resolvePlace(place, actor);
  if ("error" in where) return { ok: false, error: where.error };
  const parsed = fieldsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const password = input.password ?? "";
  if (!password) return { ok: false, error: "Falta indicar la contraseña." };
  const { name, url, username, notes, visibility, userIds } = parsed.data;
  if (visibility === "USERS" && userIds.length === 0) return { ok: false, error: "Marque al menos una persona que pueda ver la contraseña." };

  let passwordEnc: string;
  try {
    passwordEnc = encryptPassword(password);
  } catch {
    return { ok: false, error: "No se pudo guardar la contraseña de forma segura. Avise al administrador." };
  }
  const credential = await prisma.credential.create({
    data: {
      projectId: where.projectId,
      name,
      url: url || null,
      username: username || null,
      passwordEnc,
      notes: notes || null,
      visibility,
      createdById: user.id,
      allowedUsers: visibility === "USERS" ? { create: [...new Set(userIds)].map((userId) => ({ userId })) } : undefined,
      tasks: where.taskId ? { create: { taskId: where.taskId } } : undefined,
      steps: where.stepId ? { create: { stepId: where.stepId } } : undefined,
      adjustmentItems: where.adjustmentItemId ? { create: { adjustmentItemId: where.adjustmentItemId } } : undefined,
    },
  });
  await notifyNewAudience(credential.id, [], user.id);
  revalidateCredentialPaths(where.projectId, where.taskId ? [where.taskId] : []);
  return { ok: true, id: credential.id };
}

/** Edita la contraseña. Contraseña vacía = se conserva la actual. Avisa solo a quienes ganan acceso. */
export async function updateCredential(credentialId: string, input: CredentialInput, actor?: Actor): Promise<Result> {
  const user = await canManageCredential(credentialId, actor);
  if (!user) return { ok: false, error: "Solo quien creó la contraseña, el PM del proyecto o un administrador pueden editarla." };
  const parsed = fieldsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { name, url, username, notes, visibility, userIds } = parsed.data;
  if (visibility === "USERS" && userIds.length === 0) return { ok: false, error: "Marque al menos una persona que pueda ver la contraseña." };

  let passwordEnc: string | undefined;
  if (input.password) {
    try {
      passwordEnc = encryptPassword(input.password);
    } catch {
      return { ok: false, error: "No se pudo guardar la contraseña de forma segura. Avise al administrador." };
    }
  }
  const before = await credentialAudienceIds(credentialId);
  const credential = await prisma.$transaction(async (tx) => {
    await tx.credentialUser.deleteMany({ where: { credentialId } });
    return tx.credential.update({
      where: { id: credentialId },
      data: {
        name,
        url: url || null,
        username: username || null,
        notes: notes || null,
        visibility,
        ...(passwordEnc ? { passwordEnc } : {}),
        allowedUsers: visibility === "USERS" ? { create: [...new Set(userIds)].map((userId) => ({ userId })) } : undefined,
      },
      select: { projectId: true, tasks: { select: { taskId: true } } },
    });
  });
  await notifyNewAudience(credentialId, before, user.id);
  revalidateCredentialPaths(credential.projectId, credential.tasks.map((t) => t.taskId));
  safeRevalidate(`/credentials/${credentialId}`);
  return { ok: true };
}

/** Borra la contraseña de todo el proyecto (y de las tareas, pasos y ajustes donde estaba). */
export async function deleteCredential(credentialId: string, actor?: Actor): Promise<Result> {
  const user = await canManageCredential(credentialId, actor);
  if (!user) return { ok: false, error: "Solo quien creó la contraseña, el PM del proyecto o un administrador pueden eliminarla." };
  const credential = await prisma.credential.delete({ where: { id: credentialId }, select: { projectId: true, tasks: { select: { taskId: true } } } });
  revalidateCredentialPaths(credential.projectId, credential.tasks.map((t) => t.taskId));
  return { ok: true };
}

/**
 * Agrega una contraseña existente del proyecto a una tarea, paso o ajuste (Galería). Siempre queda
 * también en los insumos de la tarea: sus asignados ganan acceso y se les avisa.
 */
export async function linkCredential(credentialId: string, place: CredentialPlace, actor?: Actor): Promise<Result<{ duplicate?: boolean }>> {
  const user = await canSeeCredential(credentialId, actor);
  if (!user || "projectId" in place) return { ok: false, error: "No tiene permiso para agregar esta contraseña aquí." };
  const where = await resolvePlace(place, actor);
  if ("error" in where) return { ok: false, error: where.error };
  const credential = await prisma.credential.findUniqueOrThrow({ where: { id: credentialId }, select: { projectId: true } });
  // Spec 004: una tarea de un subproyecto también puede recibir las contraseñas de su principal (no al revés).
  const { parentId } = await prisma.project.findUniqueOrThrow({ where: { id: where.projectId }, select: { parentId: true } });
  if (credential.projectId !== where.projectId && credential.projectId !== parentId) return { ok: false, error: "La contraseña es de otro proyecto." };
  const taskId = where.taskId!;
  const [taskLink, stepLink, itemLink] = await Promise.all([
    prisma.credentialTask.findUnique({ where: { credentialId_taskId: { credentialId, taskId } } }),
    where.stepId ? prisma.credentialStep.findUnique({ where: { credentialId_stepId: { credentialId, stepId: where.stepId } } }) : null,
    where.adjustmentItemId ? prisma.credentialAdjustmentItem.findUnique({ where: { credentialId_adjustmentItemId: { credentialId, adjustmentItemId: where.adjustmentItemId } } }) : null,
  ]);
  const alreadyThere = where.stepId ? Boolean(stepLink) : where.adjustmentItemId ? Boolean(itemLink) : Boolean(taskLink);
  if (alreadyThere) return { ok: true, duplicate: true };
  const before = await credentialAudienceIds(credentialId);
  await prisma.$transaction([
    ...(taskLink ? [] : [prisma.credentialTask.create({ data: { credentialId, taskId } })]),
    ...(where.stepId ? [prisma.credentialStep.create({ data: { credentialId, stepId: where.stepId } })] : []),
    ...(where.adjustmentItemId ? [prisma.credentialAdjustmentItem.create({ data: { credentialId, adjustmentItemId: where.adjustmentItemId } })] : []),
  ]);
  await notifyNewAudience(credentialId, before, user.id);
  revalidateCredentialPaths(where.projectId, [taskId]);
  return { ok: true };
}

/**
 * Quita la contraseña de un lugar (sigue existiendo en el proyecto). Quitarla de la tarea la quita
 * también de sus pasos y ajustes (el acceso de los asignados sale de la tarea); quitarla de un paso o
 * ajuste la deja en los insumos de la tarea.
 */
export async function unlinkCredential(credentialId: string, place: CredentialPlace, actor?: Actor): Promise<Result> {
  if ("projectId" in place || !(await canSeeCredential(credentialId, actor))) return { ok: false, error: "No tiene permiso para quitar esta contraseña." };
  const where = await resolvePlace(place, actor);
  if ("error" in where) return { ok: false, error: "No tiene permiso para quitar esta contraseña." };
  if (where.stepId) await prisma.credentialStep.deleteMany({ where: { credentialId, stepId: where.stepId } });
  else if (where.adjustmentItemId) await prisma.credentialAdjustmentItem.deleteMany({ where: { credentialId, adjustmentItemId: where.adjustmentItemId } });
  else {
    await prisma.$transaction([
      prisma.credentialStep.deleteMany({ where: { credentialId, step: { taskId: where.taskId! } } }),
      prisma.credentialAdjustmentItem.deleteMany({ where: { credentialId, adjustmentItem: { taskId: where.taskId! } } }),
      prisma.credentialTask.deleteMany({ where: { credentialId, taskId: where.taskId! } }),
    ]);
  }
  revalidateCredentialPaths(where.projectId, where.taskId ? [where.taskId] : []);
  return { ok: true };
}

// Atajos usados por la API (/api/v1/tasks/:id/credentials).
export async function linkCredentialToTask(credentialId: string, taskId: string, actor?: Actor) {
  return linkCredential(credentialId, { taskId }, actor);
}
export async function unlinkCredentialFromTask(credentialId: string, taskId: string, actor?: Actor) {
  return unlinkCredential(credentialId, { taskId }, actor);
}

export type CredentialDetails = {
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  url: string | null;
  username: string | null;
  /** null = no se puede leer (se guardó con otro AUTH_SECRET). */
  password: string | null;
  notes: string | null;
  visibility: "ALL" | "PROJECT" | "USERS";
  allowedUserIds: string[];
  tasks: { id: string; title: string }[];
  createdByName: string | null;
  canManage: boolean;
};

/** Detalle completo (con la contraseña) — solo a quien tiene acceso. Queda en el historial como «abrió». */
export async function getCredentialDetails(credentialId: string, actor?: Actor): Promise<Result<{ credential: CredentialDetails }>> {
  const user = await resolveActor(actor);
  if (!user) return { ok: false, error: "La sesión terminó. Vuelva a iniciar sesión." };
  const c = await prisma.credential.findFirst({
    where: { id: credentialId, ...credentialVisibleWhere(user) },
    include: {
      project: { select: { name: true } },
      createdBy: { select: { name: true } },
      allowedUsers: { select: { userId: true } },
      tasks: { select: { task: { select: { id: true, title: true } } }, orderBy: { addedAt: "asc" } },
    },
  });
  if (!c) return { ok: false, error: "Esta contraseña no existe o no tiene acceso a ella." };
  await logCredentialAccess([credentialId], user, "VIEW", "app");
  return {
    ok: true,
    credential: {
      id: c.id,
      projectId: c.projectId,
      projectName: c.project.name,
      name: c.name,
      url: c.url,
      username: c.username,
      password: decryptPassword(c.passwordEnc),
      notes: c.notes,
      visibility: c.visibility,
      allowedUserIds: c.allowedUsers.map((u) => u.userId),
      tasks: c.tasks.map((t) => t.task),
      createdByName: c.createdBy?.name ?? null,
      canManage: Boolean(await canManageCredential(credentialId, user)),
    },
  };
}

/** Registra que la persona mostró la contraseña o copió un dato (desde el visor). */
export async function recordCredentialEvent(credentialId: string, event: Exclude<CredentialEventName, "VIEW">, actor?: Actor): Promise<Result> {
  const user = await canSeeCredential(credentialId, actor);
  if (!user) return { ok: false, error: "Esta contraseña no existe o no tiene acceso a ella." };
  await logCredentialAccess([credentialId], user, event, "app");
  return { ok: true };
}

export type CredentialLogEntry = { id: string; userName: string; event: CredentialEventName; source: string; createdAt: string };

/** Historial de acceso (más reciente primero, últimos 200): solo quien la creó, el PM o un administrador. */
export async function getCredentialAccessLog(credentialId: string, actor?: Actor): Promise<Result<{ entries: CredentialLogEntry[] }>> {
  if (!(await canManageCredential(credentialId, actor))) return { ok: false, error: "Solo quien creó la contraseña, el PM del proyecto o un administrador pueden ver el historial." };
  const rows = await prisma.credentialAccessLog.findMany({ where: { credentialId }, orderBy: { createdAt: "desc" }, take: 200 });
  return { ok: true, entries: rows.map((r) => ({ id: r.id, userName: r.userName, event: r.event, source: r.source, createdAt: r.createdAt.toISOString() })) };
}

/** Personas activas para la visibilidad «Personas concretas» (misma lista que la selección de asignados). */
export async function listCredentialCandidates(actor?: Actor): Promise<{ id: string; name: string; avatarUrl: string | null }[]> {
  if (!(await resolveActor(actor))) return [];
  return prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, avatarUrl: true }, orderBy: { name: "asc" } });
}
