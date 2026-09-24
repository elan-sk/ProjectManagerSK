import { auth } from "@/auth";
import { progressBar } from "@/lib/progressBar";
import { commentMentionIds, splitCommentBody } from "@/lib/commentBody";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { sendGroupAlert, sendDirectAlert, getWhatsAppStatus } from "@/lib/whatsapp";
import { getAppCountryCode, getWhatsAppSettings } from "@/lib/appSettings";
import { isWorkingMoment, localDateKey, localParts } from "@/lib/workingHours";
import { getAgendaCounts, getPmProjectsSummary, getProjectsSummary } from "@/lib/agendaSummary";
import { HEALTH_LABEL } from "@/lib/projectHealth";
import type { NotificationType, TaskStatus } from "@prisma/client";

// Escalamiento acordado con el usuario: lo grave (vencidas, bloqueos,
// devoluciones) va al grupo del proyecto (o al de por defecto), mencionando a los
// involucrados y al PM, todo junto en UN mensaje a la hora del resumen diario. Lo que solo le compete a
// una persona (asignación, por vencer, revisión, etc. — antes iba directo a
// su WhatsApp evento por evento) ya NO se manda individual: queda en el
// resumen diario (ver dispatchDailyDigests más abajo) para no saturarle el
// WhatsApp con un mensaje por cada cosa. Sigue creando la Notification
// in-app y el push de todos modos, eso no cambió.
const GROUP_ALERT_TYPES: NotificationType[] = ["OVERDUE", "BLOCKED", "RETURNED", "LATE_START_CRITICAL"];

// Secciones del mensaje único de alertas de grupo, en orden de importancia. `query` = filtro de la página
// del proyecto que muestra justo esas tareas (el link de cada sección lleva al proyecto ya filtrado).
const GROUP_SECTIONS: { type: NotificationType; title: string; query: string }[] = [
  { type: "OVERDUE", title: "🔴 *VENCIDAS*", query: "risk=overdue" },
  { type: "LATE_START_CRITICAL", title: "🟡 *INICIO RETRASADO HACE DÍAS*", query: "risk=lateStart" },
  { type: "BLOCKED", title: "🔒 *BLOQUEADAS*", query: "status=BLOCKED" },
  { type: "RETURNED", title: "🟠 *DEVUELTAS*", query: "status=RETURNED" },
];

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
    prisma.project.findUnique({ where: { id: projectId }, select: { whatsappGroupJid: true, hidden: true } }),
    getWhatsAppSettings(),
  ]);
  // Los proyectos ocultos nunca avisan a un grupo, ni al propio ni al por defecto.
  if (project?.hidden) return null;
  return project?.whatsappGroupJid ?? defaultGroupJid;
}

async function isCurrentlyWorkingHour() {
  const [{ workHoursStart, workHoursEnd }, countryCode] = await Promise.all([getWhatsAppSettings(), getAppCountryCode()]);
  return isWorkingMoment(new Date(), countryCode, workHoursStart, workHoursEnd);
}

// Las alertas graves de grupo no salen sueltas: se guardan y se mandan todas juntas, en un solo
// mensaje por grupo, a la hora del resumen diario (ver dispatchGroupAlertDigest).
async function dispatchGroup(groupJid: string, type: NotificationType, message: string, projectId: string, taskId: string | undefined, mentionUserIds: string[]) {
  await prisma.groupAlertItem.create({ data: { groupJid, projectId, taskId, type, message, mentionUserIds: mentionUserIds.join(",") } });
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
  options?: { projectId?: string; mentionUserIds?: string[]; excludeUserId?: string | null }
) {
  // Regla "sin auto-notificación": quien ejecuta la acción no se avisa a sí
  // mismo por ningún canal (campana, push ni WhatsApp).
  const excluded = options?.excludeUserId;
  if (excluded) {
    userIds = userIds.filter((id) => id !== excluded);
    if (options?.mentionUserIds) options = { ...options, mentionUserIds: options.mentionUserIds.filter((id) => id !== excluded) };
  }
  if (userIds.length === 0) return;
  // Punto 4: options.projectId ya existía para resolver el grupo de WhatsApp
  // de los avisos grupales (que siempre traen taskId igual) — se reusa acá
  // para guardarlo también en la Notification cuando NO hay tarea (ej.
  // comentario en la pestaña Definición), así la campana puede armar el link.
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({ userId, type, message, taskId, projectId: options?.projectId })),
  });

  await Promise.all(userIds.map((userId) => sendPushToUser(userId, message, url)));

  if (GROUP_ALERT_TYPES.includes(type)) {
    if (!options?.projectId) return;
    const groupJid = await resolveProjectGroupJid(options.projectId);
    if (groupJid) await dispatchGroup(groupJid, type, message, options.projectId, taskId, options.mentionUserIds ?? userIds);
  }
}

// Quien está ejecutando la acción (sesión del navegador). Fuera de una
// petición (scheduler, scripts) no hay sesión y devuelve null.
async function sessionUserId() {
  try {
    return (await auth())?.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function notifyAssignment(taskId: string, userIds: string[], actorId?: string | null) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  const url = `/projects/${task.projectId}/tasks/${taskId}`;
  await notify(userIds, "ASSIGNED", `Te asignaron la tarea "${task.title}"`, taskId, url, {
    excludeUserId: actorId ?? (await sessionUserId()),
  });
}

export async function notifyBlocked(taskId: string, pmId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: { assignees: true } });
  const url = `/projects/${task.projectId}/tasks/${taskId}`;
  const involvedIds = Array.from(new Set([pmId, ...task.assignees.map((a) => a.userId)]));
  await notify([pmId], "BLOCKED", `La tarea "${task.title}" fue marcada como bloqueada`, taskId, url, {
    projectId: task.projectId,
    mentionUserIds: involvedIds,
    excludeUserId: await sessionUserId(),
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
    excludeUserId: await sessionUserId(),
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
    url,
    { excludeUserId: await sessionUserId() }
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

// Mensaje directo de WhatsApp a una persona: en horario laboral sale al
// instante; fuera de horario se encola (poller de scheduler.ts), salvo
// `immediate` (urgencias), que ignora el horario.
async function dispatchDirect(userId: string, text: string, immediate = false, imageUrls?: string[]) {
  const user = await prisma.user.findFirst({ where: { id: userId, active: true, phone: { not: null } }, select: { phone: true } });
  if (!user?.phone) {
    // Antes se cortaba en silencio (ej. alguien mencionado sin teléfono cargado/inactivo
    // nunca se enteraba, sin dejar rastro de por qué) — ahora al menos queda en
    // persistent-logs con el id, para poder revisar el perfil de esa persona.
    console.warn(`[notificaciones] no se pudo avisar a ${userId} por WhatsApp: sin teléfono cargado o usuario inactivo.`);
    return;
  }
  if (immediate || (await isCurrentlyWorkingHour())) {
    void sendDirectAlert(user.phone, text, imageUrls);
  } else {
    // ponytail: fuera de horario la cola solo guarda texto (WhatsAppQueueItem no tiene
    // columna de imagen), así que la foto queda como link en vez de foto real. Sumar esa
    // columna si hace falta que también llegue como foto al vaciarse la cola.
    const imageLinks = (imageUrls ?? []).map((u) => `\n📷 ${absoluteUrl(u)}`).join("");
    await prisma.whatsAppQueueItem.create({ data: { target: `${user.phone}@s.whatsapp.net`, message: `${text}${imageLinks}` } });
  }
}

// Para WhatsApp: las imágenes se mandan como foto real (no como texto "[imagen]") y los
// archivos quedan como link con URL completa dentro del mensaje (el texto corto que usa el
// resto de la app no necesita la URL, porque ahí ya se puede tocar el adjunto).
function commentWhatsAppParts(body: string) {
  const images: string[] = [];
  const text = splitCommentBody(body)
    .map((p) => {
      if (p.type === "text") return p.text;
      if (p.type === "image") {
        images.push(p.url);
        return "";
      }
      if (p.type === "file") return `📎 ${p.name}: ${absoluteUrl(p.url)}`;
      if (p.type === "link") return `${p.name} (${p.url})`;
      return `@${p.name}`;
    })
    .join("")
    .trim();
  return { text, images };
}

// Textos de WhatsApp de comentarios y urgentes (exportados para poder previsualizarlos).
export const commentWhere = (projectName: string, taskTitle?: string | null) =>
  taskTitle ? `en la tarea "${taskTitle}" (proyecto "${projectName}")` : `en el proyecto "${projectName}"`;

export function commentText(kind: "mention" | "comment", author: string, where: string, content: string, link: string) {
  const head = kind === "mention" ? `💬 *${author}* te mencionó ${where} y dijo:` : `💬 *${author}* comentó ${where}:`;
  return `${head}\n\n“${content}”\n\n🔗 ${link}`;
}

export const urgentText = (title: string, projectName: string, link: string) =>
  `🚨 *TAREA URGENTE*\n"${title}" (${projectName}) fue marcada como urgente. Requiere atención inmediata.\n\n🔗 ${link}`;

/**
 * Comentario interno nuevo: a los @mencionados ("te mencionó") y a quienes
 * participan de la conversación — asignados, revisores, PM y quienes ya
 * comentaron ahí ("nuevo comentario"). Nunca a quien lo escribió. Por
 * WhatsApp va el nombre de quien escribe, el mensaje completo y el link
 * directo; la campana de mensajes del header ya lista los no leídos.
 * `onlyMentionIds`: al EDITAR solo se avisa a las menciones agregadas.
 */
export async function notifyInternalComment(messageId: string, opts?: { onlyMentionIds?: string[] }) {
  const message = await prisma.internalMessage.findUnique({
    where: { id: messageId },
    include: {
      author: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, pmId: true } },
      task: { select: { id: true, title: true, assignees: { select: { userId: true } }, reviewers: { select: { userId: true } } } },
    },
  });
  if (!message) return;

  const mentioned = new Set(opts?.onlyMentionIds ?? commentMentionIds(message.body));
  mentioned.delete(message.authorId);

  let participants = new Set<string>();
  if (!opts?.onlyMentionIds) {
    const priorAuthors = await prisma.internalMessage.findMany({
      where: { projectId: message.projectId, taskId: message.taskId },
      select: { authorId: true },
      distinct: ["authorId"],
    });
    participants = new Set([
      message.project.pmId,
      ...(message.task?.assignees.map((a) => a.userId) ?? []),
      ...(message.task?.reviewers.map((r) => r.userId) ?? []),
      ...priorAuthors.map((m) => m.authorId),
    ]);
    participants.delete(message.authorId);
    for (const id of mentioned) participants.delete(id);
  }

  const where = commentWhere(message.project.name, message.task?.title);
  const path = message.task ? `/projects/${message.projectId}/tasks/${message.task.id}#internal-conversation` : `/projects/${message.projectId}?view=conversation#internal-conversation`;
  const { text: content, images } = commentWhatsAppParts(message.body);
  const link = absoluteUrl(path)!;

  for (const id of mentioned) await dispatchDirect(id, commentText("mention", message.author.name, where, content, link), false, images);
  for (const id of participants) await dispatchDirect(id, commentText("comment", message.author.name, where, content, link), false, images);
}

/**
 * Tarea marcada como urgente: aviso prioritario e inmediato por WhatsApp
 * (ignora el horario laboral) al PM, asignados y revisores — menos a quien
 * la marcó. No crea una Notification de la campana a propósito: la alerta
 * de urgencia no se puede descartar como leída, vive en el acceso fijo del
 * header hasta que la tarea se complete o se desmarque.
 */
export async function notifyUrgentTask(taskId: string, actorId: string | null) {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { assignees: true, reviewers: true, project: { select: { pmId: true, name: true } } },
  });
  const path = `/projects/${task.projectId}/tasks/${taskId}`;
  const ids = new Set([task.project.pmId, ...task.assignees.map((a) => a.userId), ...task.reviewers.map((r) => r.userId)]);
  if (actorId) ids.delete(actorId);
  const text = urgentText(task.title, task.project.name, absoluteUrl(path)!);
  await Promise.all([...ids].map((id) => sendPushToUser(id, `🚨 Tarea urgente: "${task.title}"`, path)));
  for (const id of ids) await dispatchDirect(id, text, true);
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
    user.role === "ADMIN" ? getProjectsSummary(undefined, { id: userId, role: user.role }) : getPmProjectsSummary(userId),
  ]);
  const firstName = name.split(" ")[0];
  // Nada pendiente propio ni proyectos que administrar: no se manda un resumen lleno de ceros.
  if (managedProjects.length === 0 && Object.values(counts).every((n) => n === 0)) return null;

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
        p.startingSoonCount > 0 ? `🔜 ${p.startingSoonCount} empiezan pronto` : null,
        p.lateStartCount > 0 ? `⏰ ${p.lateStartCount} inicio retrasado` : null,
        p.overdueCount > 0 ? `⌛ ${p.overdueCount} final retrasado` : null,
        p.blockedCount > 0 ? `🔒 ${p.blockedCount} bloqueada(s)` : null,
      ].filter((f): f is string => f !== null);
      const progress = p.total === 0 ? 0 : Math.round((p.completed / p.total) * 100);
      // Caras (no círculos): los círculos 🟢🟡🔴 se confundían con los cuadrados 🟩🟨🟥 de la barra.
      const healthIcon = p.health === "ok" ? "😀" : p.health === "warn" ? "😐" : "😡";
      lines.push(
        "",
        `• *${p.name}*`,
        `  ↳ _Avance_`,
        `      ${progressBar(progress)} ${progress}%`,
        `  ↳ _Completadas_ · ${p.completed}/${p.total}`,
        `  ↳ _Salud_ · ${healthIcon} ${HEALTH_LABEL[p.health]}`,
        // Sin alertas: una sola línea. Con alertas: el título solo y cada
        // alerta en su propia fila debajo (se lee de un vistazo, en vez de una
        // lista larga separada por comas que se parte mal en el celular).
        ...(flags.length === 0 ? [`  ↳ _Alertas_ · sin alertas`] : [`  ↳ _Alertas_`, ...flags.map((f) => `      ${f}`)])
      );
    }
  }

  lines.push("", `🔗 ${absoluteUrl("/agenda")}`);
  return lines.join("\n");
}

// Ventana en la que se sigue intentando entregar el resumen tras su hora
// configurada: cubre un minuto saltado del poller, un reinicio o una
// desconexión corta de WhatsApp (se reintenta cada minuto), sin convertirlo
// en un "ponerse al día" de horas después.
const DIGEST_GRACE_MINUTES = 60;
// Minutos tras la hora configurada a partir de los cuales, si todavía hay
// personas sin resumen, se avisa al administrador (una sola vez por horario).
const DIGEST_REPORT_AFTER_MINUTES = 10;
// ponytail: en memoria — un reinicio del servidor dentro de la misma ventana
// puede repetir el aviso al admin una vez; persistir en DB si molesta.
const digestReported = new Set<string>();

async function reportDigestFailures(failures: { name: string; reason: string }[]) {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true, phone: true } });
  const list = failures.map((f) => `• ${f.name} — ${f.reason}`).join("\n");
  const message = `⚠️ El resumen diario no llegó a ${failures.length} persona(s):\n${list}`;
  await prisma.notification.createMany({ data: admins.map((a) => ({ userId: a.id, type: "SYSTEM" as const, message })) });
  for (const admin of admins) if (admin.phone) await sendDirectAlert(admin.phone, `*Reporte del resumen diario*\n${message}`);
}

// Ventana de envío compartida por los resúmenes: desde la hora configurada del resumen diario hasta
// DIGEST_GRACE_MINUTES después, solo en horario laboral. Devuelve false fuera de ella.
async function inDigestWindow(now: Date) {
  const { workHoursStart, workHoursEnd, dailyDigestHour, dailyDigestMinute } = await getWhatsAppSettings();
  if (!(await isWorkingMoment(now, await getAppCountryCode(), workHoursStart, workHoursEnd))) return false;
  const local = localParts(now);
  const elapsed = local.hour * 60 + local.minute - (dailyDigestHour * 60 + dailyDigestMinute);
  return elapsed >= 0 && elapsed < DIGEST_GRACE_MINUTES;
}

// ¿Sigue vigente la alerta? Una tarea que ya se completó, se desbloqueó, se corrigió o arrancó
// deja de ser noticia para cuando sale el resumen.
function groupAlertStillValid(type: string, status: TaskStatus | undefined) {
  if (!status || status === "COMPLETED") return false;
  if (type === "BLOCKED") return status === "BLOCKED";
  if (type === "RETURNED") return status === "RETURNED";
  if (type === "LATE_START_CRITICAL") return status === "NOT_STARTED";
  return true;
}

type GroupAlertEntry = { message: string; taskId: string | null; projectId: string; type: string; userIds: Set<string> };

// Sangría con espacios "em" (U+2003): WhatsApp recorta los espacios normales al inicio de la línea y no
// dibuja tabuladores, pero respeta estos.
const IND = "\u2003\u2003";

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
// "18/9/2026" (así las escribe toLocaleDateString("es-CO") en los avisos) → "18 sep": en el mensaje de
// grupo solo importan día y mes, con el mes en letras.
export const shortDates = (text: string) =>
  text.replace(/\b(\d{1,2})\/(\d{1,2})\/\d{4}\b/g, (m, d, mo) => (+mo >= 1 && +mo <= 12 ? `${+d} ${MONTHS_ES[+mo - 1]}` : m));

// El nombre de la tarea (va entre comillas al inicio del aviso) en negrita de WhatsApp.
const boldTitle = (text: string) => text.replace(/^"([^"]+)"/, "*$1*");

// Arma el texto del mensaje único: por tipo de alerta (de más a menos grave), cada tipo con UN solo link
// al Panorama general filtrado por ese tipo (ej. vencidas). Las personas a mencionar van juntas, sin
// repetir, al final de cada grupo de alertas. Con alertas de varios proyectos, cada alerta lleva además
// el nombre de su proyecto.
// Función pura (sin base ni WhatsApp) para poder verificarla en scripts/verify-group-alert-digest.ts.
export function buildGroupAlertText(
  byProject: Map<string, Map<string, GroupAlertEntry>>,
  projectName: Map<string, string>,
  phoneOf: Map<string, string>
) {
  const all = [...byProject.values()].flatMap((entries) => [...entries.values()]);
  const projectIds = [...byProject.keys()];
  const single = projectIds.length === 1;
  const lines = [`🔔 *ALERTAS PENDIENTES* (${all.length})`];
  if (single) lines.push(`📁 *${projectName.get(projectIds[0]) ?? "Proyecto"}*`);
  const mentioned = new Set<string>();
  for (const { type, title, query } of GROUP_SECTIONS) {
    const ofType = all.filter((e) => e.type === type);
    if (ofType.length === 0) continue;
    lines.push("", `${title} (${ofType.length})`, `${IND}🔗 ${absoluteUrl(`/projects?${query}`)}`);
    const people = new Set<string>();
    for (const e of ofType) {
      e.userIds.forEach((id) => phoneOf.has(id) && people.add(id));
      lines.push(`${IND}• ${single ? "" : `_${projectName.get(e.projectId) ?? "Proyecto"}_ · `}${boldTitle(shortDates(e.message))}`);
    }
    people.forEach((id) => mentioned.add(id));
    if (people.size) lines.push(`${IND}👤 ${[...people].map((id) => `@${phoneOf.get(id)}`).join(" ")}`);
  }
  return { text: lines.join("\n"), mentionedIds: [...mentioned] };
}

let groupDigestRunning = false;

// Un solo mensaje por grupo de WhatsApp con todas las alertas graves acumuladas, ordenadas por
// proyecto y por tipo, mencionando a las personas de cada una. Llamado desde el poller
// (scheduler.ts); lo que no se pueda enviar (WhatsApp caído) se reintenta cada minuto dentro de
// la ventana. Cada alerta repetida (mismo tipo y tarea) se junta en una sola línea.
export async function dispatchGroupAlertDigest() {
  if (groupDigestRunning) return;
  groupDigestRunning = true;
  try {
    if (!(await inDigestWindow(new Date()))) return;
    const items = await prisma.groupAlertItem.findMany({ where: { sentAt: null }, orderBy: { createdAt: "asc" } });
    if (items.length === 0) return;

    const [tasks, projects] = await Promise.all([
      prisma.task.findMany({ where: { id: { in: items.flatMap((i) => (i.taskId ? [i.taskId] : [])) } }, select: { id: true, status: true } }),
      prisma.project.findMany({ where: { id: { in: items.map((i) => i.projectId) } }, select: { id: true, name: true } }),
    ]);
    const statusOf = new Map(tasks.map((t) => [t.id, t.status]));
    const projectName = new Map(projects.map((p) => [p.id, p.name]));
    const live = items.filter((i) => !i.taskId || groupAlertStillValid(i.type, statusOf.get(i.taskId)));
    const liveIds = new Set(live.map((i) => i.id));
    const obsoleteIds = items.filter((i) => !liveIds.has(i.id)).map((i) => i.id);
    if (obsoleteIds.length) await prisma.groupAlertItem.updateMany({ where: { id: { in: obsoleteIds } }, data: { sentAt: new Date() } });

    const users = await prisma.user.findMany({
      where: { id: { in: live.flatMap((i) => i.mentionUserIds.split(",").filter(Boolean)) }, phone: { not: null } },
      select: { id: true, phone: true },
    });
    const phoneOf = new Map(users.map((u) => [u.id, u.phone!]));

    const byGroup = new Map<string, typeof live>();
    for (const item of live) byGroup.set(item.groupJid, [...(byGroup.get(item.groupJid) ?? []), item]);

    for (const [groupJid, groupItems] of byGroup) {
      const byProject = new Map<string, Map<string, GroupAlertEntry>>();
      for (const item of groupItems) {
        const entries = byProject.get(item.projectId) ?? new Map();
        const key = `${item.type}|${item.taskId ?? item.message}`;
        const entry = entries.get(key) ?? { message: item.message, taskId: item.taskId, projectId: item.projectId, type: item.type, userIds: new Set<string>() };
        for (const id of item.mentionUserIds.split(",").filter(Boolean)) entry.userIds.add(id);
        entries.set(key, entry);
        byProject.set(item.projectId, entries);
      }

      const { text, mentionedIds } = buildGroupAlertText(byProject, projectName, phoneOf);
      const sent = await sendGroupAlert(groupJid, text, mentionedIds, undefined, true);
      if (sent) await prisma.groupAlertItem.updateMany({ where: { id: { in: groupItems.map((i) => i.id) } }, data: { sentAt: new Date() } });
    }
  } finally {
    groupDigestRunning = false;
  }
}

// Llamado desde el poller de scheduler.ts (cada 60s). Cada horario se entrega
// una vez por usuario y día; si se cambia la hora, el nuevo horario genera un
// segundo resumen para ese mismo día. Va a TODOS los usuarios activos: quien
// no se pueda alcanzar (sin teléfono, WhatsApp caído, error de envío) queda
// en el reporte al administrador. Secuencial (no Promise.all) para no
// ráfaguear el socket de WhatsApp.
export async function dispatchDailyDigests() {
  const { workHoursStart, workHoursEnd, dailyDigestHour, dailyDigestMinute } = await getWhatsAppSettings();
  const countryCode = await getAppCountryCode();
  const now = new Date();
  if (!(await isWorkingMoment(now, countryCode, workHoursStart, workHoursEnd))) return;
  const localNow = localParts(now);
  const elapsed = localNow.hour * 60 + localNow.minute - (dailyDigestHour * 60 + dailyDigestMinute);
  if (elapsed < 0 || elapsed >= DIGEST_GRACE_MINUTES) return;

  const todayKey = localDateKey(now);
  const scheduleKey = `${todayKey}|${String(dailyDigestHour).padStart(2, "0")}:${String(dailyDigestMinute).padStart(2, "0")}`;
  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, phone: true, lastDigestSentAt: true, lastDigestScheduleKey: true },
  });

  const failures: { name: string; reason: string }[] = [];
  let digestsSent = 0;
  for (const user of users) {
    if (user.lastDigestScheduleKey === scheduleKey) continue;
    // Compatibilidad con los resúmenes enviados antes de guardar su horario:
    // históricamente siempre salían a la apertura, así que no se duplica uno
    // ya enviado hoy al instalar esta mejora.
    if (!user.lastDigestScheduleKey && dailyDigestHour === workHoursStart && dailyDigestMinute === 0 && user.lastDigestSentAt && localDateKey(user.lastDigestSentAt) === todayKey) continue;
    if (!user.phone) {
      failures.push({ name: user.name, reason: "no tiene teléfono de WhatsApp registrado" });
      continue;
    }
    const text = await buildDailyDigestText(user.id, user.name);
    if (!text) {
      // Se marca como atendido para no recalcularlo cada minuto de la ventana.
      await prisma.user.update({ where: { id: user.id }, data: { lastDigestScheduleKey: scheduleKey } });
      continue;
    }
    const sent = await sendDirectAlert(user.phone, text);
    if (sent) digestsSent++;
    if (sent) await prisma.user.update({ where: { id: user.id }, data: { lastDigestSentAt: now, lastDigestScheduleKey: scheduleKey } });
    else failures.push({ name: user.name, reason: getWhatsAppStatus().status === "connected" ? "falló el envío por WhatsApp" : "WhatsApp está desconectado" });
  }

  if (digestsSent > 0 || failures.length > 0) {
    console.log(`[resumen-diario] horario ${scheduleKey}: enviados ${digestsSent}, fallidos ${failures.length}${failures.length ? ` (${failures.map((f) => f.reason).join("; ")})` : ""}, WhatsApp ${getWhatsAppStatus().status}`);
  }
  if (failures.length > 0 && elapsed >= DIGEST_REPORT_AFTER_MINUTES && !digestReported.has(scheduleKey)) {
    digestReported.add(scheduleKey);
    await reportDigestFailures(failures);
  }
}

/**
 * Resumen diario disparado a mano (ej. desde el chat, solo admin): a todo el
 * equipo activo o a una persona. No toca las marcas del envío programado.
 * Devuelve quién no lo recibió y por qué.
 */
export async function sendDailyDigestNow(userId?: string) {
  const users = await prisma.user.findMany({ where: { active: true, ...(userId ? { id: userId } : {}) }, select: { id: true, name: true, phone: true } });
  let sent = 0;
  const failures: { name: string; reason: string }[] = [];
  for (const user of users) {
    if (!user.phone) {
      failures.push({ name: user.name, reason: "no tiene teléfono de WhatsApp registrado" });
      continue;
    }
    const text = await buildDailyDigestText(user.id, user.name);
    if (!text) {
      failures.push({ name: user.name, reason: "no tiene nada pendiente hoy" });
      continue;
    }
    if (await sendDirectAlert(user.phone, text)) sent++;
    else failures.push({ name: user.name, reason: getWhatsAppStatus().status === "connected" ? "falló el envío" : "WhatsApp está desconectado" });
  }
  return { sent, failures };
}
