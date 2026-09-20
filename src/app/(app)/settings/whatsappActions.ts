"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { STALE_QUEUE_HOURS } from "@/lib/scheduler";
import { sendRawMessage } from "@/lib/whatsapp";
import { startWhatsApp, stopWhatsApp, getWhatsAppStatus, listGroups, sendDirectAlert } from "@/lib/whatsapp";
import { setAppDailyDigestTime, setAppWhatsAppGroup, setAppWorkHours } from "@/lib/appSettings";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    throw new Error("Solo un administrador puede hacer esto.");
  }
}

export async function connectWhatsApp() {
  await requireAdmin();
  void startWhatsApp();
  return getWhatsAppStatus();
}

export async function whatsAppStatus() {
  await requireAdmin();
  return getWhatsAppStatus();
}

export async function whatsAppGroups() {
  await requireAdmin();
  return listGroups();
}

export async function updateDefaultWhatsAppGroup(groupJid: string) {
  await requireAdmin();
  await setAppWhatsAppGroup(groupJid || null);
  revalidatePath("/settings");
  return { ok: true as const };
}

export async function disconnectWhatsApp() {
  await requireAdmin();
  stopWhatsApp();
  return getWhatsAppStatus();
}

export async function updateWorkHours(startHour: number, endHour: number) {
  await requireAdmin();
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour) || startHour < 0 || endHour > 24 || startHour >= endHour) {
    return { ok: false as const, error: "Horario inválido." };
  }
  try {
    await setAppWorkHours(startHour, endHour);
  } catch (error) {
    return { ok: false as const, error: (error as Error).message };
  }
  revalidatePath("/settings");
  return { ok: true as const };
}

export async function updateDailyDigestTime(hour: number, minute: number) {
  await requireAdmin();
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return { ok: false as const, error: "Hora inválida." };
  }
  try {
    await setAppDailyDigestTime(hour, minute);
  } catch (error) {
    return { ok: false as const, error: (error as Error).message };
  }
  revalidatePath("/settings");
  return { ok: true as const };
}

// Mensaje de prueba: siempre va por DM al teléfono de quien lo pide (nunca al
// grupo real), para probar sin molestar al equipo.
export async function testWhatsAppDelivery() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Solo un administrador puede hacer esto.");
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { phone: true } });
  if (!me?.phone) return { ok: false, error: "Tu usuario no tiene un teléfono registrado. Agregalo en tu perfil para recibir la prueba." };
  const sent = await sendDirectAlert(me.phone, "🧪 *Prueba de entrega*\nLas notificaciones de ProjectManagerSK están activas.");
  return { ok: sent, error: sent ? undefined : "WhatsApp no está conectado; no se pudo enviar la prueba." };
}

// ─── Alertas viejas en cola ─────────────────────────────────────────────
// Las que llevan más de STALE_QUEUE_HOURS esperando no se envían solas: el admin elige.
const staleWhere = () => ({ sentAt: null, createdAt: { lt: new Date(Date.now() - STALE_QUEUE_HOURS * 3600_000) } });

export async function getStaleQueue() {
  await requireAdmin();
  const items = await prisma.whatsAppQueueItem.findMany({ where: staleWhere(), orderBy: { createdAt: "asc" }, select: { message: true, createdAt: true } });
  return { hours: STALE_QUEUE_HOURS, count: items.length, samples: items.slice(0, 3).map((i) => i.message.replace(/\n/g, " ").slice(0, 90)) };
}

export async function sendStaleQueue() {
  await requireAdmin();
  const items = await prisma.whatsAppQueueItem.findMany({ where: staleWhere() });
  let sent = 0;
  for (const item of items) {
    if (await sendRawMessage(item.target, item.message)) {
      await prisma.whatsAppQueueItem.update({ where: { id: item.id }, data: { sentAt: new Date() } });
      sent++;
    }
  }
  revalidatePath("/settings");
  return { ok: true as const, sent, failed: items.length - sent };
}

export async function discardStaleQueue() {
  await requireAdmin();
  const { count } = await prisma.whatsAppQueueItem.deleteMany({ where: staleWhere() });
  revalidatePath("/settings");
  return { ok: true as const, discarded: count };
}
