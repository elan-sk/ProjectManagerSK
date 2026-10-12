import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { LIVE_PROJECT_WHERE } from "@/lib/permissions";

export const DELETED_USER_NAME = "Usuario eliminado";

const ACTIVE_TASK = { status: { not: "COMPLETED" }, archivedAt: null, project: LIVE_PROJECT_WHERE } satisfies Prisma.TaskWhereInput;

type Db = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export type UserDeletionSummary = { pmProjects: number; activeTasks: number; credentials: number };

export type UserDeletionInput = {
  userId: string;
  actorId: string;
  newPmId?: string | null;
  tasksToId?: string | null;
  credentialsToId?: string | null;
};

export type UserDeletionResult = { ok: true; summary: UserDeletionSummary } | { ok: false; error: string };

export async function getUserDeletionSummary(userId: string, db: Db = prisma): Promise<UserDeletionSummary> {
  const [pmProjects, activeTasks, credentials] = await Promise.all([
    db.project.count({ where: { pmId: userId } }),
    db.task.count({ where: { ...ACTIVE_TASK, OR: [{ assignees: { some: { userId } } }, { reviewers: { some: { userId } } }] } }),
    db.credential.count({ where: { OR: [{ createdById: userId }, { allowedUsers: { some: { userId } } }] } }),
  ]);
  return { pmProjects, activeTasks, credentials };
}

function receiverMessage(tasks: number, credentials: number, projects: number) {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts = [
    projects > 0 ? plural(projects, "proyecto como PM", "proyectos como PM") : null,
    tasks > 0 ? plural(tasks, "tarea", "tareas") : null,
    credentials > 0 ? plural(credentials, "contraseña", "contraseñas") : null,
  ].filter((part): part is string => part !== null);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}` : parts[0];
  return `Recibió ${list} de una cuenta eliminada.`;
}

async function moveTaskRoles(tx: Db, userId: string, toId: string | null) {
  const [assigned, reviewing] = await Promise.all([
    tx.taskAssignee.findMany({ where: { userId, task: ACTIVE_TASK }, select: { taskId: true } }),
    tx.taskReviewer.findMany({ where: { userId, task: ACTIVE_TASK }, select: { taskId: true } }),
  ]);
  const assignedIds = assigned.map((row) => row.taskId);
  const reviewingIds = reviewing.map((row) => row.taskId);
  const allIds = [...new Set([...assignedIds, ...reviewingIds])];
  if (allIds.length === 0) return 0;

  let received = new Set<string>();
  if (toId) {
    const [targetAssigned, targetReviewing] = await Promise.all([
      tx.taskAssignee.findMany({ where: { userId: toId, taskId: { in: allIds } }, select: { taskId: true } }),
      tx.taskReviewer.findMany({ where: { userId: toId, taskId: { in: allIds } }, select: { taskId: true } }),
    ]);
    const taken = new Set([...targetAssigned, ...targetReviewing].map((row) => row.taskId));
    const movableAssigned = assignedIds.filter((id) => !taken.has(id));
    const movableReviewing = reviewingIds.filter((id) => !taken.has(id));
    await tx.taskAssignee.updateMany({ where: { userId, taskId: { in: movableAssigned } }, data: { userId: toId, viewedAt: null } });
    await tx.taskReviewer.updateMany({ where: { userId, taskId: { in: movableReviewing } }, data: { userId: toId } });
    received = new Set([...movableAssigned, ...movableReviewing]);
  }
  await tx.taskAssignee.deleteMany({ where: { userId, taskId: { in: assignedIds } } });
  await tx.taskReviewer.deleteMany({ where: { userId, taskId: { in: reviewingIds } } });
  return received.size;
}

async function moveCredentials(tx: Db, userId: string, toId: string | null) {
  const [created, access] = await Promise.all([
    tx.credential.findMany({ where: { createdById: userId }, select: { id: true, visibility: true } }),
    tx.credentialUser.findMany({ where: { userId }, select: { credentialId: true } }),
  ]);
  const createdIds = created.map((c) => c.id);
  const accessIds = access.map((row) => row.credentialId);

  if (!toId) {
    await tx.credential.deleteMany({ where: { id: { in: created.filter((c) => c.visibility === "ME").map((c) => c.id) } } });
    await tx.credential.updateMany({ where: { createdById: userId }, data: { createdById: null } });
    await tx.credentialUser.deleteMany({ where: { userId } });
    return 0;
  }

  await tx.credential.updateMany({ where: { id: { in: createdIds } }, data: { createdById: toId } });
  const already = new Set(
    (await tx.credentialUser.findMany({ where: { userId: toId, credentialId: { in: accessIds } }, select: { credentialId: true } })).map((row) => row.credentialId)
  );
  const movable = accessIds.filter((id) => !already.has(id));
  await tx.credentialUser.updateMany({ where: { userId, credentialId: { in: movable } }, data: { userId: toId } });
  await tx.credentialUser.deleteMany({ where: { userId } });
  return new Set([...createdIds, ...movable]).size;
}

export async function deleteUserPermanently(input: UserDeletionInput): Promise<UserDeletionResult> {
  const { userId, actorId } = input;
  const newPmId = input.newPmId || null;
  const tasksToId = input.tasksToId || null;
  const credentialsToId = input.credentialsToId || null;
  if (userId === actorId) return { ok: false, error: "No es posible eliminar la cuenta propia." };

  try {
    const summary = await prisma.$transaction(
      async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, deletedAt: true } });
        if (!user) throw new DeletionError("La persona ya no existe.");
        if (user.deletedAt) throw new DeletionError("Esta persona ya fue eliminada.");

        const targetIds = [...new Set([newPmId, tasksToId, credentialsToId].filter((id): id is string => id !== null))];
        if (targetIds.includes(userId)) throw new DeletionError("No se puede reasignar a la misma persona que se elimina.");
        const validTargets = await tx.user.count({ where: { id: { in: targetIds }, active: true, deletedAt: null } });
        if (validTargets !== targetIds.length) throw new DeletionError("La persona elegida para recibir ya no está activa.");

        const before = await getUserDeletionSummary(userId, tx);
        if (before.pmProjects > 0 && !newPmId) throw new DeletionError("Falta elegir el nuevo PM de sus proyectos.");

        if (newPmId) await tx.project.updateMany({ where: { pmId: userId }, data: { pmId: newPmId } });
        const tasksMoved = await moveTaskRoles(tx, userId, tasksToId);
        const credentialsMoved = await moveCredentials(tx, userId, credentialsToId);

        await tx.notification.deleteMany({ where: { userId } });
        await tx.pushSubscription.deleteMany({ where: { userId } });
        await tx.googleCalendarConnection.deleteMany({ where: { userId } });
        await tx.botMessage.deleteMany({ where: { userId } });
        await tx.internalMessageRead.deleteMany({ where: { userId } });
        await tx.internalMessageMention.deleteMany({ where: { userId } });
        await tx.claudeLink.deleteMany({ where: { userId } });
        await tx.userActivityDay.deleteMany({ where: { userId } });

        await tx.user.update({
          where: { id: userId },
          data: {
            name: DELETED_USER_NAME,
            username: `eliminado-${userId}`,
            email: null,
            phone: null,
            avatarUrl: null,
            passwordHash: `!${randomUUID()}`,
            role: "MEMBER",
            active: false,
            deletedAt: new Date(),
            whatsappIntroducedAt: null,
            lastDigestSentAt: null,
            lastDigestScheduleKey: null,
            resetTokenHash: null,
            resetTokenExpiresAt: null,
            apiSessionTokenHash: null,
            apiSessionExpiresAt: null,
          },
        });

        const received = new Map<string, { projects: number; tasks: number; credentials: number }>();
        const add = (id: string | null, key: "projects" | "tasks" | "credentials", amount: number) => {
          if (!id || amount === 0) return;
          const entry = received.get(id) ?? { projects: 0, tasks: 0, credentials: 0 };
          entry[key] += amount;
          received.set(id, entry);
        };
        add(newPmId, "projects", before.pmProjects);
        add(tasksToId, "tasks", tasksMoved);
        add(credentialsToId, "credentials", credentialsMoved);
        if (received.size > 0) {
          await tx.notification.createMany({
            data: [...received].map(([receiverId, r]) => ({ userId: receiverId, type: "SYSTEM" as const, message: receiverMessage(r.tasks, r.credentials, r.projects) })),
          });
        }
        return before;
      },
      { timeout: 30000 }
    );
    return { ok: true, summary };
  } catch (err) {
    if (err instanceof DeletionError) return { ok: false, error: err.message };
    throw err;
  }
}

class DeletionError extends Error {}
