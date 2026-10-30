import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  buildGroupRequest,
  isWindowOpen,
  joinChatParts,
  limitWarningToSend,
  noticeLink,
  oneLineSummary,
  recentGroupLines,
  stripBotMention,
  templateParam,
  cloudImageMime,
  usedThisPeriod,
  validWebhookSignature,
} from "../src/lib/whatsappCloudFormat";

const now = new Date("2026-10-30T15:00:00Z");

assert.equal(isWindowOpen(new Date("2026-10-30T01:00:00Z"), now), true, "ventana abierta dentro de 24 h");
assert.equal(isWindowOpen(new Date("2026-10-29T14:00:00Z"), now), false, "ventana cerrada después de 24 h");
assert.equal(isWindowOpen(null, now), false, "sin mensajes previos no hay ventana");

const digest = "*Resumen del día*\n📌 3 tareas para hoy\n⚠️ 1 vencida\n\n🔗 https://app.ejemplo.com/agenda";
const summary = oneLineSummary(digest);
assert.ok(!/[\n\t]/.test(summary), "resumen sin saltos ni tabulaciones");
assert.ok(!summary.includes("http"), "el link no va en el resumen");
assert.ok(summary.startsWith("Resumen del día · 📌 3 tareas"), `resumen legible: ${summary}`);
assert.ok(oneLineSummary("x".repeat(500)).length <= 300, "resumen recortado");
assert.equal(noticeLink(digest, "https://app.ejemplo.com/dashboard"), "https://app.ejemplo.com/agenda", "link del aviso");
assert.equal(noticeLink("sin link", "https://app.ejemplo.com/dashboard"), "https://app.ejemplo.com/dashboard", "link por defecto");
assert.equal(templateParam("a\nb\t c     d"), "a b c d", "parámetro de plantilla sin saltos ni espacios repetidos");
assert.equal(templateParam(" \n "), "-", "parámetro vacío nunca va vacío");

const body = JSON.stringify({ object: "whatsapp_business_account" });
const sig = `sha256=${createHmac("sha256", "secreto").update(body).digest("hex")}`;
assert.equal(validWebhookSignature(body, sig, "secreto"), true, "firma válida");
assert.equal(validWebhookSignature(body, sig, "otro"), false, "firma con otra clave");
assert.equal(validWebhookSignature(`${body} `, sig, "secreto"), false, "cuerpo alterado");
assert.equal(validWebhookSignature(body, null, "secreto"), false, "sin firma");

assert.equal(usedThisPeriod(new Date("2026-10-01T00:00:00Z"), 120, now), 120, "mismo mes conserva el contador");
assert.equal(usedThisPeriod(new Date("2026-09-01T00:00:00Z"), 120, now), 0, "mes nuevo reinicia");
assert.equal(usedThisPeriod(null, 5, now), 0, "sin período arranca en cero");
assert.equal(limitWarningToSend(1199, 1500, 0), null, "debajo del 80 %");
assert.equal(limitWarningToSend(1200, 1500, 0), 80, "aviso al 80 %");
assert.equal(limitWarningToSend(1300, 1500, 80), null, "el 80 % se avisa una sola vez");
assert.equal(limitWarningToSend(1500, 1500, 80), 100, "aviso al 100 %");
assert.equal(limitWarningToSend(1600, 1500, 100), null, "el 100 % se avisa una sola vez");
assert.equal(limitWarningToSend(1500, 1500, 0), 100, "si salta directo, avisa el 100 %");

const lines = Array.from({ length: 25 }, (_, i) => ({ author: "Ana", at: new Date(now.getTime() - (25 - i) * 60_000), text: `m${i}` }));
lines.unshift({ author: "Viejo", at: new Date(now.getTime() - 4 * 3600_000), text: "fuera de ventana" });
const recent = recentGroupLines(lines, now);
assert.equal(recent.length, 20, "máximo 20 mensajes");
assert.ok(!recent.some((l) => l.author === "Viejo"), "nada de más de 3 horas");
assert.equal(recent.at(-1)?.text, "m24", "los más recientes");

const request = buildGroupRequest({
  groupName: "Equipo Web",
  projectName: "Sitio Racafé",
  quoted: { author: "David", text: "Hay que cambiar el banner de la home" },
  recent: recent.slice(-2),
  request: "",
});
assert.ok(request.includes("«Equipo Web», del proyecto «Sitio Racafé»"), "grupo y proyecto");
assert.ok(request.includes("Responde a este mensaje de David: «Hay que cambiar el banner de la home»"), "mensaje citado con autor");
assert.ok(request.includes("Pedido: hacer lo que dice el mensaje citado"), "mención sin texto toma el citado");
assert.ok(request.includes("Ana: m24"), "mensajes recientes con autor");

assert.equal(joinChatParts([{ text: "hola", forwarded: false }]), "hola", "mensaje común sin cambios");
const joined = joinChatParts([
  { text: "Necesito el informe de ventas", forwarded: true },
  { text: "y la gráfica", forwarded: true },
  { text: "hacelo para mañana", forwarded: false },
]);
assert.ok(joined.startsWith("[Mensajes reenviados"), "marca de reenvío");
assert.ok(joined.includes("«Necesito el informe de ventas»\n«y la gráfica»"), "reenvíos juntos");
assert.ok(joined.includes("Comentario de la persona: hacelo para mañana"), "comentario aparte");

assert.equal(stripBotMention("@573001112233 creá la tarea", ["573001112233"]), "creá la tarea", "quita la mención al bot");

assert.equal(cloudImageMime(Buffer.from([0xff, 0xd8, 0xff])), "image/jpeg", "jpg");
assert.equal(cloudImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47])), "image/png", "png");
assert.equal(cloudImageMime(Buffer.from("RIFF0000WEBP")), null, "webp no se manda como imagen");

console.log("verify-whatsapp-cloud: OK");
