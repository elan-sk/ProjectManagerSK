"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { STALE_QUEUE_HOURS } from "@/lib/scheduler";
import { sendRawMessage } from "@/lib/whatsapp";
import { startWhatsApp, stopWhatsApp, unlinkWhatsApp, getWhatsAppStatus, listGroups, sendDirectAlert } from "@/lib/whatsapp";
import { setAppDailyDigestTime, setAppWhatsAppGroup, setAppWorkHours } from "@/lib/appSettings";
import { shouldRunQr } from "@/lib/whatsapp";
import { getCloudSettingsView, saveCloudSettings, setWhatsAppConnection, verifyCloudConnection, type WhatsAppConnection } from "@/lib/whatsappCloud";
import { getWhatsAppUsage, setWhatsAppMonthlyLimit } from "@/lib/whatsappUsage";
import { absoluteUrl } from "@/lib/appUrl";

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

export async function unlinkWhatsAppNumber() {
  await requireAdmin();
  await unlinkWhatsApp();
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
  const sent = await sendDirectAlert(me.phone, "🧪 *Prueba de entrega*\nLas notificaciones de ProjectManagerSK están activas.", undefined, true);
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

// Salen de a una con pausa (ver paced en whatsapp.ts), así que pueden tardar minutos: se envían en
// segundo plano y la pantalla no espera. La marca evita mandarlas dos veces si se vuelve a pulsar.
let staleSending = false;
export async function sendStaleQueue() {
  await requireAdmin();
  if (staleSending) return { ok: true as const, queued: 0, alreadySending: true };
  const items = await prisma.whatsAppQueueItem.findMany({ where: staleWhere() });
  staleSending = true;
  void (async () => {
    for (const item of items) {
      if (await sendRawMessage(item.target, item.message)) {
        await prisma.whatsAppQueueItem.update({ where: { id: item.id }, data: { sentAt: new Date() } });
      }
    }
  })()
    .catch((err) => console.error("[whatsapp] falló el envío de alertas viejas", err))
    .finally(() => {
      staleSending = false;
    });
  return { ok: true as const, queued: items.length, alreadySending: false };
}

export async function discardStaleQueue() {
  await requireAdmin();
  const { count } = await prisma.whatsAppQueueItem.deleteMany({ where: staleWhere() });
  revalidatePath("/settings");
  return { ok: true as const, discarded: count };
}

export async function whatsAppCloudView() {
  await requireAdmin();
  const [cloud, usage] = await Promise.all([getCloudSettingsView(), getWhatsAppUsage()]);
  return { ...cloud, webhookUrl: absoluteUrl("/api/whatsapp/cloud") ?? "/api/whatsapp/cloud", usage };
}

export async function updateWhatsAppConnection(mode: WhatsAppConnection) {
  await requireAdmin();
  if (mode !== "qr" && mode !== "cloud") return { ok: false as const, error: "Conexión inválida." };
  await setWhatsAppConnection(mode);
  if (await shouldRunQr()) void startWhatsApp().catch((err) => console.error("[whatsapp] no se pudo abrir el QR", err));
  else stopWhatsApp();
  revalidatePath("/settings");
  return { ok: true as const };
}

export async function updateWhatsAppCloud(input: { phoneNumberId: string; accessToken: string; appSecret: string; templateName: string; templateLang: string }) {
  await requireAdmin();
  if (!/^\d{5,30}$/.test(input.phoneNumberId.trim())) return { ok: false as const, error: "El identificador del número son solo dígitos; se copia de Meta → WhatsApp → Configuración de la API." };
  await saveCloudSettings(input);
  const check = await verifyCloudConnection();
  revalidatePath("/settings");
  return check.ok ? { ok: true as const, displayNumber: check.displayNumber, name: check.name } : { ok: false as const, error: check.error };
}

export async function updateWhatsAppMonthlyLimit(limit: number) {
  await requireAdmin();
  if (!Number.isInteger(limit) || limit < 1 || limit > 100_000) return { ok: false as const, error: "El tope debe ser un número entre 1 y 100.000." };
  await setWhatsAppMonthlyLimit(limit);
  revalidatePath("/settings");
  return { ok: true as const };
}
