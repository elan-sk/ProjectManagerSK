import { prisma } from "@/lib/prisma";
import { sendGroupAlert, sendRawMessage } from "@/lib/whatsapp";
import { getAppCountryCode, getWhatsAppSettings } from "@/lib/appSettings";
import { isWorkingMoment, meetingReminderTargetTime } from "@/lib/workingHours";
import { dispatchDailyDigests, dispatchGroupAlertDigest } from "@/lib/notifications";
import { ensureWhatsAppAlive } from "@/lib/whatsapp";

const POLL_INTERVAL_MS = 60_000;
export const STALE_QUEUE_HOURS = 12;

// Vacía la cola de alertas que cayeron fuera de horario laboral (ver
// notifications.ts) apenas vuelve a abrir el horario.
async function dispatchQueuedAlerts() {
  const { workHoursStart, workHoursEnd } = await getWhatsAppSettings();
  const countryCode = await getAppCountryCode();
  if (!(await isWorkingMoment(new Date(), countryCode, workHoursStart, workHoursEnd))) return;

  // Las alertas con más de STALE_QUEUE_HOURS en cola NO salen solas (ya no son "en tiempo real"):
  // el admin decide en Configuración → WhatsApp si las envía o las descarta.
  const pending = await prisma.whatsAppQueueItem.findMany({ where: { sentAt: null, createdAt: { gte: new Date(Date.now() - STALE_QUEUE_HOURS * 3600_000) } } });
  for (const item of pending) {
    const sent = await sendRawMessage(item.target, item.message);
    if (sent) await prisma.whatsAppQueueItem.update({ where: { id: item.id }, data: { sentAt: new Date() } });
  }
}

// Fecha completa en vez de "hoy/mañana" porque el recordatorio puede salir
// el día hábil anterior a la reunión (ver meetingReminderTargetTime).
const MEETING_TIME_FORMAT = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

// Recordatorio de reunión al grupo del proyecto, 30 min antes (o antes si el
// horario laboral no lo permite) — mencionando a los asignados y al PM.
async function dispatchMeetingReminders() {
  const now = new Date();
  const upcoming = await prisma.task.findMany({
    where: { meetingAt: { gt: now }, meetingReminderSentAt: null, meetingUrl: { not: null }, project: { hidden: false } },
    include: { project: { select: { pmId: true, whatsappGroupJid: true } }, assignees: true },
  });
  if (upcoming.length === 0) return;

  const countryCode = await getAppCountryCode();
  const { workHoursStart, workHoursEnd, groupJid: defaultGroupJid } = await getWhatsAppSettings();

  for (const task of upcoming) {
    const target = await meetingReminderTargetTime(task.meetingAt!, countryCode, workHoursStart, workHoursEnd);
    if (now < target) continue;

    const groupJid = task.project.whatsappGroupJid ?? defaultGroupJid;
    if (groupJid) {
      const time = MEETING_TIME_FORMAT.format(task.meetingAt!);
      const mentionIds = Array.from(new Set([task.project.pmId, ...task.assignees.map((a) => a.userId)]));
      void sendGroupAlert(groupJid, `📅 *Recordatorio de reunión*\n"${task.title}"\n🕐 ${time}`, mentionIds, task.meetingUrl!);
    }
    await prisma.task.update({ where: { id: task.id }, data: { meetingReminderSentAt: new Date() } });
  }
}

let started = false;

export function startScheduler() {
  if (started) return;
  started = true;
  // No esperar el primer minuto tras un reinicio: si WhatsApp ya estaba
  // conectado, las colas/digests pendientes deben poder salir de inmediato.
  void dispatchQueuedAlerts().catch((err) => console.error("[scheduler] dispatchQueuedAlerts inicial falló", err));
  void dispatchMeetingReminders().catch((err) => console.error("[scheduler] dispatchMeetingReminders inicial falló", err));
  void dispatchDailyDigests().catch((err) => console.error("[scheduler] dispatchDailyDigests inicial falló", err));
  void dispatchGroupAlertDigest().catch((err) => console.error("[scheduler] dispatchGroupAlertDigest inicial falló", err));
  // Cada tarea ataja su propio error: una falla de una (ej. una columna que
  // todavía no llegó por una migración pendiente) no debe tumbar el proceso
  // entero — un rechazo de promesa sin atajar en Node mata el server completo,
  // como pasó en producción el 2026-09-13 (ver notifications.ts).
  setInterval(() => {
    // Reconexión de WhatsApp en segundo plano, con o sin admin en la web.
    ensureWhatsAppAlive();
    dispatchQueuedAlerts().catch((err) => console.error("[scheduler] dispatchQueuedAlerts falló", err));
    dispatchMeetingReminders().catch((err) => console.error("[scheduler] dispatchMeetingReminders falló", err));
    dispatchDailyDigests().catch((err) => console.error("[scheduler] dispatchDailyDigests falló", err));
    dispatchGroupAlertDigest().catch((err) => console.error("[scheduler] dispatchGroupAlertDigest falló", err));
  }, POLL_INTERVAL_MS);
}
