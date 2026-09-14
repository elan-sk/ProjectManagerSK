import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { sendGroupAlert, sendDirectAlert } from "@/lib/whatsapp";
import { getAppCountryCode, getWhatsAppSettings } from "@/lib/appSettings";
import { isWorkingMoment, localDateKey, localParts } from "@/lib/workingHours";
import { getAgendaCounts, getPmProjectsSummary, getProjectsSummary } from "@/lib/agendaSummary";
import { HEALTH_LABEL } from "@/lib/projectHealth";
import type { NotificationType } from "@prisma/client";

// Escalamiento acordado con el usuario: lo grave (vencidas, bloqueos,
// devoluciones) va en tiempo real al grupo del proyecto (o al de por
// defecto), mencionando a los involucrados y al PM. Lo que solo le compete a
// una persona (asignación, por vencer, revisión, etc. — antes iba directo a
// su WhatsApp evento por evento) ya NO se manda individual: queda en el
// resumen diario (ver dispatchDailyDigests más abajo) para no saturarle el
// WhatsApp con un mensaje por cada cosa. Sigue creando la Notification
// in-app y el push de todos modos, eso no cambió.
const GROUP_ALERT_TYPES: NotificationType[] = ["OVERDUE", "BLOCKED", "RETURNED", "LATE_START_CRITICAL"];

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
  // Punto 4: options.projectId ya existía para resolver el grupo de WhatsApp
  // de los avisos grupales (que siempre traen taskId igual) — se reusa acá
  // para guardarlo también en la Notification cuando NO hay tarea (ej.
  // comentario en la pestaña Definición), así la campana puede armar el link.
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({ userId, type, message, taskId, projectId: options?.projectId })),
  });

  await Promise.all(userIds.map((userId) => sendPushToUser(userId, message, url)));

  const body = formatWhatsAppText(type, message);
  const link = absoluteUrl(url);

  if (GROUP_ALERT_TYPES.includes(type)) {
    if (!options?.projectId) return;
    const groupJid = await resolveProjectGroupJid(options.projectId);
    if (groupJid) await dispatchGroup(groupJid, body, options.mentionUserIds ?? userIds, link);
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
  // Una alerta de agenda es un estado diario, no un evento por cada render
  // del layout. Aunque el usuario marque la campana como leída, no se vuelve
  // a crear ni reenviar hasta el siguiente día laboral.
  const notifiedSince = today;

  for (const task of tasks) {
    const plannedEnd = new Date(task.plannedEnd);
    plannedEnd.setHours(0, 0, 0, 0);
    const plannedStart = new Date(task.plannedStart);
    plannedStart.setHours(0, 0, 0, 0);
    const url = `/projects/${task.projectId}/tasks/${task.id}`;

    const type = plannedEnd < today ? "OVERDUE" : plannedEnd <= warningThreshold ? "DEADLINE_APPROACHING" : null;
    if (type) {
      const alreadyNotified = await prisma.notification.findFirst({
        where: { userId, taskId: task.id, type, createdAt: { gte: notifiedSince } },
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
        where: { userId, taskId: task.id, type: lateType, createdAt: { gte: notifiedSince } },
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

// Resumen diario por WhatsApp (reemplaza el aviso individual evento por
// evento) — un solo mensaje a la hora configurada, con conteos en vez de tarea
// por tarea. Mismos números
// que ve la persona en los tiles de /agenda (ver agendaSummary.ts).
export async function buildDailyDigestText(userId: string, name: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true } });
  const [counts, managedProjects] = await Promise.all([
    getAgendaCounts(userId),
    user.role === "ADMIN" ? getProjectsSummary() : getPmProjectsSummary(userId),
  ]);
  const firstName = name.split(" ")[0];

  // Mismo orden de importancia que en /agenda y /projects: inicio retrasado
  // (todavía se puede evitar el daño) → por vencer → final retrasado (ya es
  // tarde) → bloqueada.
  const lines = [
    `👋 *¡Buenos días, ${firstName}!*`,
    "",
    "📋 *Tu agenda de hoy:*",
    `• ${counts.lateStart} con inicio retrasado`,
    `• ${counts.warning} por vencer`,
    `• ${counts.overdue} con final retrasado`,
    `• ${counts.blocked} bloqueada(s)`,
    `• ${counts.unopened} tarea(s) nueva(s) sin abrir`,
  ];

  if (managedProjects.length > 0) {
    lines.push("", user.role === "ADMIN" ? "📁 *Resumen de todos los proyectos:*" : "📁 *Tus proyectos administrados:*");
    for (const p of managedProjects) {
      const flags = [
        // Preventivo primero (todavía a tiempo de evitarlo) — solo le llega a
        // quien administra el proyecto, por eso vive acá y no en el conteo
        // personal de arriba.
        p.startingSoonCount > 0 ? `${p.startingSoonCount} empiezan pronto` : null,
        p.lateStartCount > 0 ? `${p.lateStartCount} inicio retrasado` : null,
        p.overdueCount > 0 ? `${p.overdueCount} final retrasado` : null,
        p.blockedCount > 0 ? `${p.blockedCount} bloqueada(s)` : null,
      ]
        .filter(Boolean)
        .join(", ");
      const progress = p.total === 0 ? 0 : Math.round((p.completed / p.total) * 100);
      const healthIcon = p.health === "ok" ? "🟢" : p.health === "warn" ? "🟡" : "🔴";
      lines.push(
        "",
        `• *${p.name}*`,
        `  ↳ _Avance_ · ${progress}% (${p.completed}/${p.total} completadas)`,
        `  ↳ _Salud_ · ${healthIcon} ${HEALTH_LABEL[p.health]}`,
        `  ↳ _Alertas_ · ${flags || "sin alertas"}`
      );
    }
  }

  lines.push("", `🔗 ${absoluteUrl("/agenda")}`);
  return lines.join("\n");
}

// Llamado desde el poller de scheduler.ts (cada 60s): la mayoría de los
// ticks no hacen nada fuera de la hora configurada. Cada horario se entrega
// una vez por usuario y día; si se cambia la hora, el nuevo horario genera un
// segundo resumen para ese mismo día. Secuencial (no Promise.all) para no
// ráfaguear el socket de WhatsApp con muchos envíos simultáneos.
export async function dispatchDailyDigests() {
  const { workHoursStart, workHoursEnd, dailyDigestHour, dailyDigestMinute } = await getWhatsAppSettings();
  const countryCode = await getAppCountryCode();
  const now = new Date();
  if (!(await isWorkingMoment(now, countryCode, workHoursStart, workHoursEnd))) return;
  const localNow = localParts(now);
  // El resumen es un evento programado, no una tarea de "ponerse al día".
  // Así, reiniciar el servidor, reconectar WhatsApp o recuperar una clave
  // después de la hora no puede generar un resumen inesperado. El poller
  // corre cada minuto, por lo que el minuto configurado sigue cubierto.
  const configuredMinutes = dailyDigestHour * 60 + dailyDigestMinute;
  const currentMinutes = localNow.hour * 60 + localNow.minute;
  if (currentMinutes !== configuredMinutes) return;

  const todayKey = localDateKey(now);
  const scheduleKey = `${todayKey}|${String(dailyDigestHour).padStart(2, "0")}:${String(dailyDigestMinute).padStart(2, "0")}`;
  const users = await prisma.user.findMany({
    where: { active: true, phone: { not: null } },
    select: { id: true, name: true, phone: true, lastDigestSentAt: true, lastDigestScheduleKey: true },
  });

  for (const user of users) {
    if (user.lastDigestScheduleKey === scheduleKey) continue;
    // Compatibilidad con los resúmenes enviados antes de guardar su horario:
    // históricamente siempre salían a la apertura, así que no se duplica uno
    // ya enviado hoy al instalar esta mejora.
    if (!user.lastDigestScheduleKey && dailyDigestHour === workHoursStart && dailyDigestMinute === 0 && user.lastDigestSentAt && localDateKey(user.lastDigestSentAt) === todayKey) continue;
    const text = await buildDailyDigestText(user.id, user.name);
    const sent = await sendDirectAlert(user.phone!, text);
    if (sent) await prisma.user.update({ where: { id: user.id }, data: { lastDigestSentAt: now, lastDigestScheduleKey: scheduleKey } });
  }
}
