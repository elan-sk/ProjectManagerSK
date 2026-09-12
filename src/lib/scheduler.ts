import { prisma } from "@/lib/prisma";
import { sendGroupAlert, sendRawMessage } from "@/lib/whatsapp";
import { getAppCountryCode, getWhatsAppSettings } from "@/lib/appSettings";
import { isWorkingMoment, meetingReminderTargetTime } from "@/lib/workingHours";

const POLL_INTERVAL_MS = 60_000;

// Vacía la cola de alertas que cayeron fuera de horario laboral (ver
// notifications.ts) apenas vuelve a abrir el horario.
async function dispatchQueuedAlerts() {
  const { workHoursStart, workHoursEnd } = await getWhatsAppSettings();
  const countryCode = await getAppCountryCode();
  if (!(await isWorkingMoment(new Date(), countryCode, workHoursStart, workHoursEnd))) return;

  const pending = await prisma.whatsAppQueueItem.findMany({ where: { sentAt: null } });
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
    where: { meetingAt: { gt: now }, meetingReminderSentAt: null, meetingUrl: { not: null } },
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
  setInterval(() => {
    void dispatchQueuedAlerts();
    void dispatchMeetingReminders();
  }, POLL_INTERVAL_MS);
}
