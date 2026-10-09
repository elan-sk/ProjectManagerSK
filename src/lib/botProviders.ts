// Servicios de IA que puede usar el chat (Chontatec). Todos hablan el formato de la API de Anthropic,
// así que el motor (chontatec.ts) es el mismo y solo cambian la dirección, la clave y el modelo.
// Sin "use client" ni prisma: lo comparten Configuración (navegador) y el servidor.
export type BotProvider = "anthropic" | "deepseek" | "custom";

export const BOT_PROVIDERS: Record<BotProvider, { label: string; baseURL: string | null; defaultModel: string; keyPlaceholder: string }> = {
  anthropic: { label: "Claude (Anthropic)", baseURL: null, defaultModel: "claude-opus-5", keyPlaceholder: "sk-ant-…" },
  // https://api-docs.deepseek.com/guides/anthropic_api — no lee PDF escaneados (bloque "document").
  deepseek: { label: "DeepSeek", baseURL: "https://api.deepseek.com/anthropic", defaultModel: "deepseek-v4-pro", keyPlaceholder: "sk-…" },
  custom: { label: "Otro compatible con Anthropic", baseURL: null, defaultModel: "", keyPlaceholder: "Clave del servicio" },
};

export const isBotProvider = (value: unknown): value is BotProvider => typeof value === "string" && value in BOT_PROVIDERS;
