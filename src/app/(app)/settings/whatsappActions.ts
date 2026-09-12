"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { startWhatsApp, getWhatsAppStatus, listGroups } from "@/lib/whatsapp";
import { setAppWhatsAppGroup, setAppWorkHours } from "@/lib/appSettings";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    throw new Error("Solo un administrador puede hacer esto.");
  }
}

export async function connectWhatsApp() {
  await requireAdmin();
  void startWhatsApp();
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

export async function updateWorkHours(startHour: number, endHour: number) {
  await requireAdmin();
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour) || startHour < 0 || endHour > 24 || startHour >= endHour) {
    return { ok: false as const, error: "Horario inválido." };
  }
  await setAppWorkHours(startHour, endHour);
  revalidatePath("/settings");
  return { ok: true as const };
}
