// Servicios de IA que puede usar el chat (Chontatec). El historial se guarda siempre en el formato de
// Anthropic: los servicios "anthropic" lo usan directo (mismo SDK, otra dirección); los "openai" pasan
// por la traducción de src/lib/botOpenAI.ts.
// Sin "use client" ni prisma: lo comparten Configuración (navegador) y el servidor.
export type BotProvider = "anthropic" | "deepseek" | "custom" | "gemini" | "openai";

export const BOT_PROVIDERS: Record<
  BotProvider,
  { label: string; format: "anthropic" | "openai"; baseURL: string | null; defaultModel: string; keyPlaceholder: string }
> = {
  anthropic: { label: "Claude (Anthropic)", format: "anthropic", baseURL: null, defaultModel: "claude-opus-5", keyPlaceholder: "sk-ant-…" },
  // https://api-docs.deepseek.com/guides/anthropic_api — no lee PDF escaneados (bloque "document").
  deepseek: { label: "DeepSeek", format: "anthropic", baseURL: "https://api.deepseek.com/anthropic", defaultModel: "deepseek-v4-pro", keyPlaceholder: "sk-…" },
  // https://ai.google.dev/gemini-api/docs/openai — plan gratis con límites por minuto y por día.
  gemini: { label: "Gemini (Google)", format: "openai", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", defaultModel: "gemini-3.8-flash", keyPlaceholder: "AIza…" },
  custom: { label: "Otro compatible con Anthropic", format: "anthropic", baseURL: null, defaultModel: "", keyPlaceholder: "Clave del servicio" },
  openai: { label: "Otro compatible con OpenAI", format: "openai", baseURL: null, defaultModel: "", keyPlaceholder: "Clave del servicio" },
};

/** Servicios sin dirección fija: se escribe la dirección y el modelo a mano. */
export const providerNeedsUrl = (provider: BotProvider) => BOT_PROVIDERS[provider].baseURL === null && provider !== "anthropic";

export const isBotProvider = (value: unknown): value is BotProvider => typeof value === "string" && value in BOT_PROVIDERS;
