import assert from "node:assert/strict";
import { createOpenAICompatMessage, withoutOpenAIExtras, OpenAICompatError } from "../src/lib/botOpenAI";

// Traducción Anthropic ⇄ OpenAI del chat (Gemini / «Otro compatible con OpenAI»), con un fetch simulado.
type Sent = { model: string; messages: Array<Record<string, unknown>>; tools: Array<{ function: { parameters: { properties: Record<string, Record<string, unknown>> } } }> };

async function main() {
  let sent: Sent | null = null;
  let status = 200;
  let calls = 0;
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    calls++;
    sent = JSON.parse(init.body);
    if (status !== 200) return new Response("saturado", { status });
    return new Response(
      JSON.stringify({
        choices: [{ finish_reason: "tool_calls", message: { content: "Reviso.", tool_calls: [{ id: "c2", type: "function", function: { name: "list_projects", arguments: "{}" }, extra_content: { google: { thought_signature: "sig2" } } }] } }],
      }),
      { status: 200 }
    );
  }) as typeof fetch;

  const r = await createOpenAICompatMessage({
    baseURL: "https://x.test/v1/",
    apiKey: "k",
    model: "m",
    maxTokens: 100,
    system: "reglas",
    tools: [{ name: "set_test_template", description: "d", input_schema: { type: "object", properties: { templateId: { type: ["string", "null"] } } } }],
    messages: [
      { role: "user", content: [{ type: "text", text: "hola" }] },
      { role: "assistant", content: [{ type: "text", text: "busco" }, { type: "tool_use", id: "c1", name: "read_uploaded_file", input: { url: "/uploads/a.png" }, _extra: { google: { thought_signature: "sig1" } } } as never] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "c1", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } }] }] },
    ],
  });

  const msgs = sent!.messages;
  assert.equal(msgs[0].role, "system");
  assert.deepEqual(msgs.map((m) => m.role), ["system", "user", "assistant", "tool", "user"]);
  const call = (msgs[2].tool_calls as Array<Record<string, unknown>>)[0];
  assert.equal(call.id, "c1");
  assert.deepEqual(call.extra_content, { google: { thought_signature: "sig1" } }, "la firma de Gemini vuelve tal cual");
  assert.equal(msgs[3].tool_call_id, "c1");
  assert.match(JSON.stringify(msgs[4].content), /data:image\/jpeg;base64,QUJD/, "la imagen va en un mensaje de usuario");
  const prop = sent!.tools[0].function.parameters.properties.templateId;
  assert.equal(prop.type, "string");
  assert.equal(prop.nullable, true);

  // Respuesta → bloques de Anthropic, con el dato propio guardado para la próxima vuelta.
  assert.equal(r.stopReason, "tool_use");
  assert.equal(r.content[0].type, "text");
  const use = r.content[1] as { type: string; id: string; name: string; _extra?: unknown };
  assert.equal(use.type, "tool_use");
  assert.equal(use.id, "c2");
  assert.deepEqual(use._extra, { google: { thought_signature: "sig2" } });
  const clean = withoutOpenAIExtras([{ role: "assistant", content: r.content }]);
  assert.ok(!JSON.stringify(clean).includes("_extra"), "a un servicio Anthropic no le llega _extra");

  // Saturado (429): 2 reintentos y luego error con su código.
  status = 429;
  calls = 0;
  await assert.rejects(
    createOpenAICompatMessage({ baseURL: "https://x.test", apiKey: "k", model: "m", maxTokens: 1, system: "", tools: [], messages: [] }),
    (e: unknown) => e instanceof OpenAICompatError && e.status === 429
  );
  assert.equal(calls, 3);

  console.log("OK — traducción Anthropic ⇄ OpenAI del chat");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
