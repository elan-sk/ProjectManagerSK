import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { trimHistory, withCacheOnLast } from "../src/lib/botHistory";

// Historial que viaja al servicio de IA: empieza en un mensaje real, recorta resultados viejos y marca la caché.
const long = "x".repeat(5000) + "<!--ids:taskId=t1-->";
const msgs: Anthropic.MessageParam[] = [
  // Resultado suelto al inicio (el corte de la ventana lo dejó sin su tool_use): debe salir.
  { role: "user", content: [{ type: "tool_result", tool_use_id: "a0", content: "huérfano" }] },
  { role: "assistant", content: [{ type: "text", text: "respuesta vieja" }] },
  { role: "user", content: [{ type: "text", text: "pregunta vieja" }] },
  { role: "assistant", content: [{ type: "tool_use", id: "a1", name: "create_task", input: {} }] },
  { role: "user", content: [{ type: "tool_result", tool_use_id: "a1", content: long }, { type: "tool_result", tool_use_id: "a2", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QQ==" } }] }] },
  { role: "assistant", content: [{ type: "text", text: "listo" }] },
  { role: "user", content: [{ type: "text", text: "pregunta actual" }] },
  { role: "assistant", content: [{ type: "tool_use", id: "a3", name: "list_projects", input: {} }] },
  { role: "user", content: [{ type: "tool_result", tool_use_id: "a3", content: long }] },
];

const out = trimHistory(msgs);
assert.equal(out[0].role, "user");
assert.equal(JSON.stringify(out[0]).includes("huérfano"), false, "el resultado suelto del inicio sale");
assert.equal(out.length, msgs.length - 2, "empieza en el primer mensaje real de la persona");
const old = (out[2].content as Anthropic.ToolResultBlockParam[]);
assert.ok((old[0].content as string).length < 1700, "resultado viejo recortado");
assert.match(old[0].content as string, /<!--ids:taskId=t1-->/, "conserva los ids ocultos");
assert.match(old[1].content as string, /Archivo revisado/, "la imagen vieja se reemplaza por un aviso");
const current = (out[out.length - 1].content as Anthropic.ToolResultBlockParam[])[0];
assert.equal((current.content as string).length, long.length, "la pregunta actual no se recorta");

const cached = withCacheOnLast(out);
const lastBlock = (cached[cached.length - 1].content as Array<{ cache_control?: unknown }>).at(-1)!;
assert.deepEqual(lastBlock.cache_control, { type: "ephemeral" });
assert.equal("cache_control" in (out[out.length - 1].content as object[]).at(-1)!, false, "no modifica el original (no se guarda)");

console.log("OK — historial del chat recortado y caché de Claude");
