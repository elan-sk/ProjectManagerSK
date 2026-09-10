import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import type { NotificationType } from "@prisma/client";

// Toda alarma pasa por acá: queda in-app (columna Notification) Y se manda
// como Web Push a cada dispositivo suscrito del usuario asignado — así llega
// aunque no tenga la app abierta, como pidió el punto 14 del manuscrito.
export async function notify(
  userIds: string[],
  type: NotificationType,
  message: string,
  taskId?: string,
  url?: string
) {
  if (userIds.length === 0) return;
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({ userId, type, message, taskId })),
  });

  await Promise.all(userIds.map((userId) => sendPushToUser(userId, message, url)));
}

export async function notifyAssignment(taskId: string, userIds: string[]) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  const url = `/projects/${task.projectId}/tasks/${taskId}`;
  await notify(userIds, "ASSIGNED", `Te asignaron la tarea "${task.title}"`, taskId, url);
}

export async function notifyBlocked(taskId: string, pmId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  const url = `/projects/${task.projectId}/tasks/${taskId}`;
  await notify([pmId], "BLOCKED", `La tarea "${task.title}" fue marcada como bloqueada`, taskId, url);
}

// ponytail: sin cron real todavía — se recalcula al cargar el layout
// protegido (barato: solo tareas del usuario logueado) y evita duplicar
// alertas ya creadas para la misma tarea/tipo mientras sigan sin leer.
const DEADLINE_WARNING_DAYS = 2;

export async function checkDeadlineAlerts(userId: string) {
  const tasks = await prisma.task.findMany({
    where: {
      status: { not: "COMPLETED" },
      assignees: { some: { userId } },
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const warningThreshold = new Date(today);
  warningThreshold.setDate(warningThreshold.getDate() + DEADLINE_WARNING_DAYS);

  for (const task of tasks) {
    const plannedEnd = new Date(task.plannedEnd);
    plannedEnd.setHours(0, 0, 0, 0);

    const type = plannedEnd < today ? "OVERDUE" : plannedEnd <= warningThreshold ? "DEADLINE_APPROACHING" : null;
    if (!type) continue;

    const alreadyNotified = await prisma.notification.findFirst({
      where: { userId, taskId: task.id, type, read: false },
    });
    if (alreadyNotified) continue;

    const message =
      type === "OVERDUE"
        ? `"${task.title}" está vencida (debía terminar el ${plannedEnd.toLocaleDateString("es-CO")}).`
        : `"${task.title}" vence el ${plannedEnd.toLocaleDateString("es-CO")}.`;
    const url = `/projects/${task.projectId}/tasks/${task.id}`;
    await notify([userId], type, message, task.id, url);
  }
}
