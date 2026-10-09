import type Anthropic from "@anthropic-ai/sdk";

// Qué parte del historial viaja al servicio de IA en cada pedido (el chat sigue MOSTRANDO todo).
// Cada pedido reenvía el historial completo, así que esto es lo que más tokens ahorra.
export const HISTORY_WINDOW = 20;
const OLD_RESULT_MAX_CHARS = 1500;
const OLD_FILE_TEXT = "[Archivo revisado en un mensaje anterior; volver a leerlo si hace falta.]";

const isRealUserMessage = (m: Anthropic.MessageParam) =>
  m.role === "user" && (typeof m.content === "string" || !m.content.some((b) => b.type === "tool_result"));

// Recorta un resultado viejo conservando los ids ocultos (<!--ids:…-->), que el modelo usa para armar links.
function shortenResult(text: string) {
  if (text.length <= OLD_RESULT_MAX_CHARS) return text;
  const hidden = (text.match(/<!--[\s\S]*?-->/g) ?? []).join("");
  return `${text.replace(/<!--[\s\S]*?-->/g, "").slice(0, OLD_RESULT_MAX_CHARS)}\n[…recortado; volver a consultar si hace falta]${hidden}`;
}

/**
 * `messages`: los últimos HISTORY_WINDOW en orden. Empieza en un mensaje real de la persona (nunca en
 * un resultado de herramienta suelto, que el servicio rechaza) y, antes de la pregunta actual, recorta
 * los resultados largos de herramientas y quita archivos ya leídos.
 */
export function trimHistory(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const start = messages.findIndex(isRealUserMessage);
  if (start === -1) return messages;
  const kept = messages.slice(start);
  let current = kept.length - 1;
  while (current > 0 && !isRealUserMessage(kept[current])) current--;
  return kept.map((m, i) => {
    if (i >= current || typeof m.content === "string" || !m.content.some((b) => b.type === "tool_result")) return m;
    return {
      ...m,
      content: m.content.map((b) =>
        b.type !== "tool_result" ? b : { ...b, content: typeof b.content === "string" ? shortenResult(b.content) : Array.isArray(b.content) && b.content.some((c) => c.type !== "text") ? OLD_FILE_TEXT : b.content }
      ),
    };
  });
}

/**
 * Solo Claude: marca el último bloque como reutilizable (caché), así la 2.ª y 3.ª vuelta de una misma
 * pregunta (herramientas de lectura) no pagan de nuevo todo el historial. Se aplica a una copia al
 * enviar; nunca se guarda.
 */
export function withCacheOnLast(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  if (messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  const blocks: Anthropic.ContentBlockParam[] = typeof last.content === "string" ? [{ type: "text", text: last.content }] : [...last.content];
  const tail = blocks[blocks.length - 1];
  if (!tail || tail.type === "thinking" || tail.type === "redacted_thinking") return messages;
  blocks[blocks.length - 1] = { ...tail, cache_control: { type: "ephemeral" } } as Anthropic.ContentBlockParam;
  return [...messages.slice(0, -1), { ...last, content: blocks }];
}
