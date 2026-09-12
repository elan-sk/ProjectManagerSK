"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getBotSettings, setBotProfile, setBotApiKey, setBotMonthlyLimit, setBotPersonaPrompt } from "@/lib/botSettings";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    throw new Error("Solo un administrador puede hacer esto.");
  }
}

export async function updateBotProfile(name: string, avatarUrl: string | null) {
  await requireAdmin();
  await setBotProfile(name, avatarUrl);
  revalidatePath("/settings");
  return { ok: true as const };
}

export async function updateBotAvatar(url: string) {
  await requireAdmin();
  const current = await getBotSettings();
  await setBotProfile(current.name, url);
  revalidatePath("/settings");
  return { ok: true as const };
}

export async function updateBotApiKey(rawKey: string) {
  await requireAdmin();
  if (!rawKey.trim()) return { ok: false as const, error: "La clave no puede estar vacía." };
  await setBotApiKey(rawKey.trim());
  revalidatePath("/settings");
  return { ok: true as const };
}

export async function clearBotApiKey() {
  await requireAdmin();
  await setBotApiKey(null);
  revalidatePath("/settings");
  return { ok: true as const };
}

// text vacío/null restaura el tono de fábrica (setBotPersonaPrompt ya lo maneja).
export async function updateBotPersonaPrompt(text: string) {
  await requireAdmin();
  await setBotPersonaPrompt(text);
  revalidatePath("/settings");
  return { ok: true as const };
}

export async function updateBotMonthlyLimit(limit: number) {
  await requireAdmin();
  if (!Number.isInteger(limit) || limit < 1) {
    return { ok: false as const, error: "El tope tiene que ser un número entero mayor a 0." };
  }
  await setBotMonthlyLimit(limit);
  revalidatePath("/settings");
  return { ok: true as const };
}
