import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { sendGroupAlert, sendDirectAlert } from "@/lib/whatsapp";
import { getAppCountryCode, getWhatsAppSettings } from "@/lib/appSettings";
import { isWorkingMoment } from "@/lib/workingHours";
import type { NotificationType } from "@prisma/client";

// Escalamiento acordado con el usuario: lo que solo le compete a una persona
// o es de bajo impacto va directo a su WhatsApp; lo grave (vencidas,
// bloqueos, devoluciones) va al grupo del proyecto (o al de por defecto)
// mencionando a los involucrados y al PM.
const GROUP_ALERT_TYPES: NotificationType[] = ["OVERDUE", "BLOCKED", "RETURNED", "LATE_START_CRITICAL"];
const DIRECT_ALERT_TYPES: NotificationType[] = ["ASSIGNED", "DEADLINE_APPROACHING", "LATE_START", "REVIEW_REQUESTED", "SHARE_ACTIVITY"];

// Semáforo de severidad (mismo criterio que NOTIFICATION_TYPE_COLOR en
// statusColors.ts: rojo = urgente, ámbar = por vencer, azul = informativo,
// naranja = devuelta) — encabezado corto para distinguir el tipo de un
// vistazo dentro del chat/grupo de WhatsApp.
const NOTIFICATION_TYPE_HEADER: Partial<Record<NotificationType, string>> = {
  ASSIGNED: "🔵 *Nueva asignación*",
  DEADLINE_APPROACHING: "🟡 *Por vencer*",
  OVERDUE: "🔴 *Tarea vencida*",
  BLOCKED: "🔴 *Tarea bloqueada*",
  RETURNED: "🟠 *Tarea devuelta*",
  LATE_START: "🟡 *Inicio retrasado*",
  LATE_START_CRITICAL: "🔴 *Inicio retrasado hace días*",
  REVIEW_REQUESTED: "🔵 *Para revisar*",
  SHARE_ACTIVITY: "🔵 *Actividad en link compartido*",
};

function formatWhatsAppText(type: NotificationType, message: string) {
  const header = NOTIFICATION_TYPE_HEADER[type];
  return header ? `${header}\n${message}` : message;
}

// El link va SIEMPRE al final (después de las menciones, ver sendGroupAlert)
// en su propia línea con protocolo completo — así el detector de URLs de
// WhatsApp lo reconoce como clickeable.
function absoluteUrl(url?: string) {
  if (!url) return undefined;
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `${base}${url}`;
}

async function resolveProjectGroupJid(projectId: string) {
  const [project, { groupJid: defaultGroupJid }] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { whatsappGroupJid: true } }),
    getWhatsAppSettings(),
  ]);
  return project?.whatsappGroupJid ?? defaultGroupJid;
}

async function isCurrentlyWorkingHour() {
  const [{ workHoursStart, workHoursEnd }, countryCode] = await Promise.all([getWhatsAppSettings(), getAppCountryCode()]);
  return isWorkingMoment(new Date(), countryCode, workHoursStart, workHoursEnd);
}

// Fuera de horario laboral, en vez de mandar directo, se encola para que el
// poller de scheduler.ts la despache apenas vuelve a abrir el horario.
async function dispatchGroup(groupJid: string, body: string, mentionUserIds: string[], link?: string) {
  if (await isCurrentlyWorkingHour()) {
    void sendGroupAlert(groupJid, body, mentionUserIds, link);
  } else {
    // ponytail: se pierde el resaltado de mención real de WhatsApp para los
    // mensajes encolados (quedan como texto plano) — upgrade si hace falta:
    // guardar también los teléfonos a mencionar en WhatsAppQueueItem.
    const mentioned = mentionUserIds.length
      ? await prisma.user.findMany({ where: { id: { in: mentionUserIds }, phone: { not: null } }, select: { phone: true } })
      : [];
    const mentionLine = mentioned.length ? `\n👤 ${mentioned.map((u) => `@${u.phone}`).join(" ")}` : "";
    const linkLine = link ? `\n\n🔗 ${link}` : "";
    await prisma.whatsAppQueueItem.create({ data: { target: groupJid, message: `${body}${mentionLine}${linkLine}` } });
  }
}

async function dispatchDirect(phone: string, body: string, link?: string) {
  const text = link ? `${body}\n\n🔗 ${link}` : body;
  if (await isCurrentlyWorkingHour()) {
    void sendDirectAlert(phone, text);
  } else {
    await prisma.whatsAppQueueItem.create({ data: { target: `${phone}@s.whatsapp.net`, message: text } });
  }
}

// Toda alarma pasa por acá: queda in-app (columna Notification) Y se manda
// como Web Push a cada dispositivo suscrito del usuario asignado — así llega
// aunque no tenga la app abierta, como pidió el punto 14 del manuscrito.
// `options.projectId` es obligatorio para los tipos grupales (resuelve el
// grupo de WhatsApp); `options.mentionUserIds` permite mencionar en el grupo
// a más gente de la que recibe la notificación in-app (ej. todos los
// asignados+PM aunque el chequeo se haya disparado para uno solo de ellos).
export async function notify(
  userIds: string[],
  type: NotificationType,
  message: string,
  taskId?: string,
  url?: string,
  options?: { projectId?: string; mentionUserIds?: string[] }
) {
  if (userIds.length === 0) return;
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({ userId, type, message, taskId })),
  });

  await Promise.all(userIds.map((userId) => sendPushToUser(userId, message, url)));

  const body = formatWhatsAppText(type, message);
  const link = absoluteUrl(url);

  if (GROUP_ALERT_TYPES.includes(type)) {
    if (!options?.projectId) return;
    const groupJid = await resolveProjectGroupJid(options.projectId);
    if (groupJid) await dispatchGroup(groupJid, body, options.mentionUserIds ?? userIds, link);
  } else if (DIRECT_ALERT_TYPES.includes(type)) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, phone: { not: null } },
      select: { phone: true },
    });
    await Promise.all(users.map((u) => dispatchDirect(u.phone!, body, link)));
  }
}

export async function notifyAssignment(taskId: string, userIds: string[]) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  const url = `/projects/${task.projectId}/tasks/${taskId}`;
  await notify(userIds, "ASSIGNED", `Te asignaron la tarea "${task.title}"`, taskId, url);
}

export async function notifyBlocked(taskId: string, pmId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: { assignees: true } });
  const url = `/projects/${task.projectId}/tasks/${taskId}`;
  const involvedIds = Array.from(new Set([pmId, ...task.assignees.map((a) => a.userId)]));
  await notify([pmId], "BLOCKED", `La tarea "${task.title}" fue marcada como bloqueada`, taskId, url, {
    projectId: task.projectId,
    mentionUserIds: involvedIds,
  });
}

// Devolución en revisión (ReviewOutcome.RETURNED) — a diferencia de BLOCKED,
// acá sí interesa avisar in-app/push a todos los involucrados de una, no
// solo al PM: asignados, PM y revisores de la ronda.
export async function notifyReturned(taskId: string) {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { assignees: true, reviewers: true, project: { select: { pmId: true } } },
  });
  const url = `/projects/${task.projectId}/tasks/${taskId}`;
  const involvedIds = Array.from(
    new Set([task.project.pmId, ...task.assignees.map((a) => a.userId), ...task.reviewers.map((r) => r.userId)])
  );
  await notify(involvedIds, "RETURNED", `La tarea "${task.title}" fue devuelta en revisión`, taskId, url, {
    projectId: task.projectId,
  });
}

// Ronda nueva enviada a revisión — a los revisores de la tarea, no al PM ni
// al asignado (que ya sabe que la envió). Antes no existía ningún aviso acá:
// un revisor solo se enteraba si entraba a mirar la tarea a mano.
export async function notifyReviewRequested(taskId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: { reviewers: true } });
  if (task.reviewers.length === 0) return;
  const url = `/projects/${task.projectId}/tasks/${taskId}`;
  await notify(
    task.reviewers.map((r) => r.userId),
    "REVIEW_REQUESTED",
    `"${task.title}" está esperando tu revisión`,
    taskId,
    url
  );
}

// Alguien comentó o subió un archivo desde el link compartido de la tarea
// (punto 16 confirmado con el usuario) — avisa a PM, asignados y revisores.
export async function notifyShareActivity(taskId: string, message: string) {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { assignees: true, reviewers: true, project: { select: { pmId: true } } },
  });
  const url = `/projects/${task.projectId}/tasks/${taskId}`;
  const involvedIds = Array.from(
    new Set([task.project.pmId, ...task.assignees.map((a) => a.userId), ...task.reviewers.map((r) => r.userId)])
  );
  await notify(involvedIds, "SHARE_ACTIVITY", message, taskId, url);
}

// ponytail: sin cron real todavía — se recalcula al cargar el layout
// protegido (barato: solo tareas del usuario logueado) y evita duplicar
// alertas ya creadas para la misma tarea/tipo mientras sigan sin leer.
const DEADLINE_WARNING_DAYS = 2;
// Mismo umbral (2 días) acordado con el usuario para la alerta de "debería
// estar en curso pero no se ha iniciado": suave (LATE_START) hasta 2 días de
// calendario, grave (LATE_START_CRITICAL, va al grupo) de ahí en más.
const LATE_START_CRITICAL_AFTER_DAYS = 2;

export async function checkDeadlineAlerts(userId: string) {
  const tasks = await prisma.task.findMany({
    where: {
      status: { not: "COMPLETED" },
      assignees: { some: { userId } },
    },
    include: { project: { select: { pmId: true } }, assignees: true },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const warningThreshold = new Date(today);
  warningThreshold.setDate(warningThreshold.getDate() + DEADLINE_WARNING_DAYS);

  for (const task of tasks) {
    const plannedEnd = new Date(task.plannedEnd);
    plannedEnd.setHours(0, 0, 0, 0);
    const plannedStart = new Date(task.plannedStart);
    plannedStart.setHours(0, 0, 0, 0);
    const url = `/projects/${task.projectId}/tasks/${task.id}`;

    const type = plannedEnd < today ? "OVERDUE" : plannedEnd <= warningThreshold ? "DEADLINE_APPROACHING" : null;
    if (type) {
      const alreadyNotified = await prisma.notification.findFirst({
        where: { userId, taskId: task.id, type, read: false },
      });
      if (!alreadyNotified) {
        const message =
          type === "OVERDUE"
            ? `"${task.title}" está vencida (debía terminar el ${plannedEnd.toLocaleDateString("es-CO")}).`
            : `"${task.title}" vence el ${plannedEnd.toLocaleDateString("es-CO")}.`;

        if (type === "OVERDUE") {
          const involvedIds = Array.from(new Set([userId, task.project.pmId, ...task.assignees.map((a) => a.userId)]));
          await notify([userId], type, message, task.id, url, { projectId: task.projectId, mentionUserIds: involvedIds });
        } else {
          await notify([userId], type, message, task.id, url);
        }
      }
    }

    // Debería estar en curso (plannedStart ya pasó) pero sigue NOT_STARTED —
    // solo mientras plannedEnd no haya pasado todavía; si ya pasó, el aviso
    // de OVERDUE de arriba ya cubre el caso sin duplicar alerta.
    if (task.status === "NOT_STARTED" && plannedStart <= today && today <= plannedEnd) {
      const daysLate = Math.round((today.getTime() - plannedStart.getTime()) / 86400000);
      const lateType: NotificationType = daysLate > LATE_START_CRITICAL_AFTER_DAYS ? "LATE_START_CRITICAL" : "LATE_START";

      const alreadyNotifiedLate = await prisma.notification.findFirst({
        where: { userId, taskId: task.id, type: lateType, read: false },
      });
      if (!alreadyNotifiedLate) {
        const lateMessage =
          lateType === "LATE_START_CRITICAL"
            ? `"${task.title}" debía iniciar el ${plannedStart.toLocaleDateString("es-CO")} y sigue sin arrancar.`
            : `"${task.title}" debía iniciar el ${plannedStart.toLocaleDateString("es-CO")} y todavía no arranca.`;

        if (lateType === "LATE_START_CRITICAL") {
          const involvedIds = Array.from(new Set([userId, task.project.pmId, ...task.assignees.map((a) => a.userId)]));
          await notify([userId], lateType, lateMessage, task.id, url, { projectId: task.projectId, mentionUserIds: involvedIds });
        } else {
          await notify([userId], lateType, lateMessage, task.id, url);
        }
      }
    }
  }
}
