"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { startWhatsApp, stopWhatsApp, getWhatsAppStatus, listGroups, sendGroupAlert } from "@/lib/whatsapp";
import { getWhatsAppSettings, setAppDailyDigestTime, setAppWhatsAppGroup, setAppWorkHours } from "@/lib/appSettings";

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

// Diagnóstico administrado desde la UI para la ruta de alertas altas al grupo.
// Los mensajes individuales manuales solo salen desde el chat, con la
// confirmación y el control de rol de Chontatec.
export async function testWhatsAppDelivery() {
  await requireAdmin();
  const { groupJid } = await getWhatsAppSettings();
  const text = "Prueba de entrega: las notificaciones de ProjectManagerSK están activas.";
  const group = groupJid ? await sendGroupAlert(groupJid, `🧪 *Prueba de alerta alta*\n${text}`) : false;
  return {
    ok: group,
    group,
    error: !groupJid ? "No hay grupo predeterminado configurado." : undefined,
  };
}
