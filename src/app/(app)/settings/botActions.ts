"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getBotSettings, setBotProfile, setBotApiKey, setBotConnection, setBotMonthlyLimit, setBotPersonaPrompt, setBotIntroMessage } from "@/lib/botSettings";
import { isBotProvider, providerNeedsUrl } from "@/lib/botProviders";

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

/** Servicio de IA del chat. La clave es obligatoria si no hay una o si cambia el servicio. */
export async function updateBotConnection(input: { provider: string; baseUrl: string; model: string; apiKey: string }) {
  await requireAdmin();
  if (!isBotProvider(input.provider)) return { ok: false as const, error: "Elija un servicio de la lista." };
  const current = await getBotSettings();
  const baseUrl = input.baseUrl.trim();
  const model = input.model.trim();
  const apiKey = input.apiKey.trim();
  const needsUrl = providerNeedsUrl(input.provider);
  if (needsUrl) {
    if (!/^https:\/\/\S+$/i.test(baseUrl)) return { ok: false as const, error: "Falta la dirección del servicio (debe empezar por https://)." };
    if (!model) return { ok: false as const, error: "Falta indicar el modelo del servicio." };
  }
  if (!apiKey && (!current.apiKeyConfigured || current.provider !== input.provider)) {
    return { ok: false as const, error: "Falta la clave de ese servicio." };
  }
  await setBotConnection(input.provider, needsUrl ? baseUrl : null, model || null, apiKey || null);
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

// text vacío/null restaura el mensaje de presentación de fábrica (setBotIntroMessage ya lo maneja).
export async function updateBotIntroMessage(text: string) {
  await requireAdmin();
  await setBotIntroMessage(text);
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
