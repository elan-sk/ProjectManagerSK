import type Anthropic from "@anthropic-ai/sdk";

// Traducción para los servicios con formato OpenAI (Gemini, «Otro compatible con OpenAI»). El chat
// guarda y razona siempre en el formato de Anthropic (chontatec.ts); acá se traduce cada pedido a
// /chat/completions y la respuesta de vuelta a bloques de Anthropic. Sin SDK nuevo: es un fetch.

type Block = Anthropic.ContentBlockParam & { _extra?: unknown };
type ToolCall = { id?: string; type?: string; function: { name: string; arguments: string }; extra_content?: unknown };
type OpenAIMessage =
  | { role: "system" | "user"; content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

/** Error con el código HTTP del servicio (401 = clave inválida), igual que los del SDK de Anthropic. */
export class OpenAICompatError extends Error {
  constructor(public status: number, body: string) {
    super(`${status} ${body.slice(0, 2000)}`);
  }
}

// Algunos servicios (Gemini) no aceptan `type: ["string", "null"]`: queda el tipo real + nullable.
function normalizeSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(normalizeSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === "type" && Array.isArray(v)) {
      out.type = v.find((t) => t !== "null") ?? "string";
      if (v.includes("null")) out.nullable = true;
    } else out[k] = normalizeSchema(v);
  }
  return out;
}

function toOpenAIMessages(system: string, messages: Anthropic.MessageParam[]): OpenAIMessage[] {
  const out: OpenAIMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push(m.role === "user" ? { role: "user", content: m.content } : { role: "assistant", content: m.content });
      continue;
    }
    const blocks = m.content as Block[];
    const text = blocks
      .filter((b): b is Anthropic.TextBlockParam => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    if (m.role === "assistant") {
      const calls = blocks.filter((b) => b.type === "tool_use") as Array<Anthropic.ToolUseBlockParam & { _extra?: unknown }>;
      out.push({
        role: "assistant",
        content: text || null,
        ...(calls.length
          ? {
              tool_calls: calls.map((c) => ({
                id: c.id,
                type: "function",
                function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) },
                // Dato propio del servicio (ej. la firma de razonamiento de Gemini 3): se devuelve tal cual.
                ...(c._extra !== undefined ? { extra_content: c._extra } : {}),
              })),
            }
          : {}),
      });
      continue;
    }
    // Usuario: los resultados de herramientas van como mensajes "tool" (solo texto); las imágenes de
    // esos resultados, en un mensaje de usuario justo después (el rol "tool" no admite imágenes).
    const images: string[] = [];
    for (const b of blocks) {
      if (b.type !== "tool_result") continue;
      const parts = typeof b.content === "string" ? [{ type: "text" as const, text: b.content }] : (b.content ?? []);
      const texts: string[] = [];
      for (const p of parts) {
        if (p.type === "text") texts.push(p.text);
        else if (p.type === "image" && p.source.type === "base64") {
          images.push(`data:${p.source.media_type};base64,${p.source.data}`);
          texts.push("[La imagen va en el mensaje siguiente.]");
        }
      }
      out.push({ role: "tool", tool_call_id: b.tool_use_id, content: (b.is_error ? "ERROR: " : "") + (texts.join("\n") || "(sin contenido)") });
    }
    if (images.length) out.push({ role: "user", content: [{ type: "text", text: "Imágenes de los resultados anteriores:" }, ...images.map((url) => ({ type: "image_url" as const, image_url: { url } }))] });
    if (text) out.push({ role: "user", content: text });
  }
  return out;
}

export async function createOpenAICompatMessage(opts: {
  baseURL: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  system: string;
  tools: Anthropic.Tool[];
  messages: Anthropic.MessageParam[];
  /** Hora límite (Date.now()) para responder: no se espera ni se reintenta más allá. */
  deadline: number;
}): Promise<{ content: Anthropic.ContentBlock[]; stopReason: "end_turn" | "tool_use" | "refusal" }> {
  const body = JSON.stringify({
    model: opts.model,
    max_tokens: opts.maxTokens,
    messages: toOpenAIMessages(opts.system, opts.messages),
    tools: opts.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description ?? "", parameters: normalizeSchema(t.input_schema) } })),
    tool_choice: "auto",
  });
  const url = `${opts.baseURL.replace(/\/+$/, "")}/chat/completions`;

  // Hasta 2 reintentos si el servicio está saturado (429/5xx), solo mientras quede tiempo.
  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      const wait = 1000 * 2 ** (attempt - 1);
      if (opts.deadline - Date.now() < wait + 5_000) break;
      await new Promise((r) => setTimeout(r, wait));
    }
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${opts.apiKey}` },
      body,
      signal: AbortSignal.timeout(Math.max(1_000, opts.deadline - Date.now())),
    });
    if (res.status !== 429 && res.status < 500) break;
  }
  if (!res!.ok) throw new OpenAICompatError(res!.status, await res!.text().catch(() => ""));

  const data = (await res!.json()) as { choices?: Array<{ finish_reason?: string; message?: { content?: string | null; tool_calls?: ToolCall[] } }> };
  const choice = data.choices?.[0];
  if (!choice?.message) throw new OpenAICompatError(502, "Respuesta sin mensaje");
  if (choice.finish_reason === "content_filter") return { content: [], stopReason: "refusal" };

  const content: Array<Anthropic.ContentBlock & { _extra?: unknown }> = [];
  if (choice.message.content?.trim()) content.push({ type: "text", text: choice.message.content, citations: null });
  for (const [i, c] of (choice.message.tool_calls ?? []).entries()) {
    let input: unknown = {};
    try {
      input = c.function.arguments ? JSON.parse(c.function.arguments) : {};
    } catch {
      // Argumentos mal armados: la herramienta los rechaza con su propio mensaje (zod) y el modelo corrige.
    }
    content.push({
      type: "tool_use",
      id: c.id || `call_${Date.now()}_${i}`,
      name: c.function.name,
      input,
      ...(c.extra_content !== undefined ? { _extra: c.extra_content } : {}),
    } as Anthropic.ToolUseBlock & { _extra?: unknown });
  }
  return { content, stopReason: content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn" };
}

/** Quita el dato propio de los servicios OpenAI (_extra) antes de mandar el historial a uno con formato Anthropic. */
export function withoutOpenAIExtras(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  return messages.map((m) =>
    typeof m.content === "string" || !m.content.some((b) => "_extra" in b)
      ? m
      : { ...m, content: m.content.map((b) => ("_extra" in b ? (({ _extra, ...rest }) => (void _extra, rest))(b as Block) : b)) as Anthropic.ContentBlockParam[] }
  );
}
