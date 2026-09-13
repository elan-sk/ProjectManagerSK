import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { APP_SETTING_ID } from "@/lib/appSettings";

// Tono/personalidad de fábrica — se usa cuando nadie configuró uno propio
// desde Configuración (botPersonaPrompt null/vacío). Las reglas operativas
// no negociables (usar las tools, nunca inventar datos) están fijas en
// src/lib/chontatec.ts y no forman parte de este texto editable.
export const DEFAULT_BOT_PERSONA =
  'Tu tono es amable, alegre y respetuoso, con un toque sutil del habla del Chocó (Colombia) — expresiones como "melo", "vea pues", "¡qué más!" de vez en cuando, sin abusar ni forzarlo en cada frase. Sos cercano pero profesional: la gente te consulta para trabajar, no para el show.';

export async function getBotSettings() {
  const s = await prisma.appSetting.findUnique({ where: { id: APP_SETTING_ID } });
  return {
    name: s?.botName ?? "Chontatec",
    avatarUrl: s?.botAvatarUrl ?? null,
    apiKeyConfigured: Boolean(s?.botApiKey),
    apiKeyLast4: s?.botApiKey ? s.botApiKey.slice(-4) : null,
    monthlyLimit: s?.botMonthlyQuestionLimit ?? 300,
    usedThisPeriod: s?.botQuestionsUsedThisPeriod ?? 0,
    personaPrompt: s?.botPersonaPrompt?.trim() || DEFAULT_BOT_PERSONA,
    personaIsCustom: Boolean(s?.botPersonaPrompt?.trim()),
  };
}

// Server-only, usado por chontatec.ts al armar el system prompt.
export async function getBotPersonaPrompt(): Promise<string> {
  const s = await prisma.appSetting.findUnique({ where: { id: APP_SETTING_ID } });
  return s?.botPersonaPrompt?.trim() || DEFAULT_BOT_PERSONA;
}

// text vacío o null restaura el default de fábrica (no guarda un string
// vacío — mismo criterio que clearBotApiKey).
export async function setBotPersonaPrompt(text: string | null) {
  const value = text?.trim() || null;
  await prisma.appSetting.upsert({
    where: { id: APP_SETTING_ID },
    create: { id: APP_SETTING_ID, botPersonaPrompt: value },
    update: { botPersonaPrompt: value },
  });
}

// Server-only: la clave real. NUNCA exportar/devolver esto desde un server
// action que el cliente pueda invocar — solo la usa src/lib/chontatec.ts.
export async function getBotApiKey(): Promise<string | null> {
  const s = await prisma.appSetting.findUnique({ where: { id: APP_SETTING_ID } });
  return s?.botApiKey ?? null;
}

export async function getBotName(): Promise<string> {
  const s = await prisma.appSetting.findUnique({ where: { id: APP_SETTING_ID } });
  return s?.botName ?? "Chontatec";
}

// Punto 5: imagen de perfil del bot para adjuntar a sus mensajes de
// WhatsApp — mismo archivo que ya se sube desde Configuración (Avatar,
// botAvatarUrl apunta a un path bajo public/). No hay conversión a webp
// (no hay ninguna librería de imágenes instalada en el proyecto — agregar
// una solo para esto sería una dependencia nueva para lo que Baileys ya
// resuelve mandando el PNG/JPG como imagen normal, ver whatsapp.ts) — por
// eso se manda como imagen adjunta con texto, no como sticker real de
// WhatsApp (eso sí exige webp). Devuelve null si no hay avatar configurado
// o si el archivo no se puede leer (best-effort, nunca rompe el envío).
export async function getBotAvatarBuffer(): Promise<Buffer | null> {
  const s = await prisma.appSetting.findUnique({ where: { id: APP_SETTING_ID } });
  if (!s?.botAvatarUrl) return null;
  try {
    return await readFile(path.join(process.cwd(), "public", s.botAvatarUrl));
  } catch {
    return null;
  }
}

export async function setBotProfile(name: string, avatarUrl: string | null) {
  await prisma.appSetting.upsert({
    where: { id: APP_SETTING_ID },
    create: { id: APP_SETTING_ID, botName: name, botAvatarUrl: avatarUrl },
    update: { botName: name, botAvatarUrl: avatarUrl },
  });
}

// rawKey === null borra/desactiva la clave (el bot vuelve a mostrar el
// mensaje de "no configurado" en vez de intentar llamar a la API).
export async function setBotApiKey(rawKey: string | null) {
  await prisma.appSetting.upsert({
    where: { id: APP_SETTING_ID },
    create: { id: APP_SETTING_ID, botApiKey: rawKey },
    update: { botApiKey: rawKey },
  });
}

export async function setBotMonthlyLimit(limit: number) {
  await prisma.appSetting.upsert({
    where: { id: APP_SETTING_ID },
    create: { id: APP_SETTING_ID, botMonthlyQuestionLimit: limit },
    update: { botMonthlyQuestionLimit: limit },
  });
}

// Reseteo mensual "perezoso": no hay cron. Cada vez que se va a consumir una
// pregunta, se compara el inicio del período guardado contra el 1° del mes
// calendario actual (UTC) — si quedó atrás, se resetea el contador acá
// mismo antes de chequear el tope. Atómico vía $transaction (better-sqlite3
// es de escritor único, así que esto no tiene condición de carrera real
// entre dos mensajes concurrentes).
export async function checkAndConsumeBotQuestion(): Promise<{ ok: true; remaining: number } | { ok: false }> {
  return prisma.$transaction(async (tx) => {
    const setting = await tx.appSetting.upsert({
      where: { id: APP_SETTING_ID },
      create: { id: APP_SETTING_ID },
      update: {},
    });

    const now = new Date();
    const currentPeriodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const needsReset = !setting.botUsagePeriodStart || setting.botUsagePeriodStart < currentPeriodStart;
    const usedBefore = needsReset ? 0 : setting.botQuestionsUsedThisPeriod;

    if (usedBefore >= setting.botMonthlyQuestionLimit) {
      if (needsReset) {
        await tx.appSetting.update({
          where: { id: APP_SETTING_ID },
          data: { botQuestionsUsedThisPeriod: 0, botUsagePeriodStart: currentPeriodStart },
        });
      }
      return { ok: false as const };
    }

    await tx.appSetting.update({
      where: { id: APP_SETTING_ID },
      data: { botQuestionsUsedThisPeriod: usedBefore + 1, botUsagePeriodStart: currentPeriodStart },
    });
    return { ok: true as const, remaining: setting.botMonthlyQuestionLimit - (usedBefore + 1) };
  });
}
