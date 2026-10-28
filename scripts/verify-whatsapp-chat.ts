import assert from "node:assert/strict";
import { toWhatsAppText, splitWhatsApp, extractUploadFiles, parseConfirmation, normalizePhone } from "../src/lib/whatsappFormat";
import { withUploadNote } from "../src/lib/chatUploadNote";
import { runAsUser, contextActor } from "../src/lib/actorContext";
import { auth } from "../src/auth";

async function main() {
process.env.NEXTAUTH_URL = "https://app.ejemplo.com";

const md = [
  "**Resumen**",
  "## Tareas",
  "- [[person:Ana Gómez|/uploads/a.png]] tiene [[status:IN_PROGRESS]] en [[project:Web Racafé|p1|]] [[alert:overdue]]",
  "- Ver [la tarea](/projects/p1/tasks/t1)",
  "| Nombre | Días |",
  "|---|---|",
  "| Ana | 3 |",
  "Archivo: [informe.docx](/uploads/abc123.docx) <!--ids:taskId=t1-->",
].join("\n");
const wa = toWhatsAppText(md);
assert.ok(wa.startsWith("*Resumen*"), "negrita de Markdown a WhatsApp");
assert.ok(wa.includes("*Tareas*"), "título a negrita");
assert.ok(wa.includes("Ana Gómez tiene En curso en Web Racafé ⚠️ Vencida") || /Ana Gómez tiene .+ en Web Racafé ⚠️ Vencida/.test(wa), `persona, estado, proyecto y alerta como texto: ${wa}`);
assert.ok(!wa.includes("[["), "sin sintaxis interna");
assert.ok(wa.includes("la tarea: https://app.ejemplo.com/projects/p1/tasks/t1"), "link relativo a absoluto");
assert.ok(wa.includes("Ana · 3") && !wa.includes("|"), "tabla a líneas");
assert.ok(!wa.includes("ids:"), "sin comentarios ocultos");

assert.deepEqual(extractUploadFiles(md), [{ url: "/uploads/abc123.docx", name: "informe.docx" }], "archivo de la app para mandar como documento");
assert.deepEqual(extractUploadFiles("[x](https://app.ejemplo.com/uploads/z.pdf) [p](/uploads/proto.html)"), [{ url: "/uploads/z.pdf", name: "x" }], "absoluto sí, HTML no");

const long = Array.from({ length: 900 }, (_, i) => `palabra${i}`).join(" ");
const parts = splitWhatsApp(long, 1000);
assert.ok(parts.length > 1 && parts.every((p) => p.length <= 1000), "partición por tamaño");
assert.equal(parts.join(" "), long, "sin cortar ni perder palabras");

for (const yes of ["sí", "Si", "SÍ!", "dale", "✅ Confirmar", "ok."]) assert.equal(parseConfirmation(yes), "confirm", yes);
for (const no of ["no", "No.", "❌ Cancelar", "cancelar"]) assert.equal(parseConfirmation(no), "decline", no);
for (const other of ["sí, pero cambiá la fecha", "noviembre", "¿qué tareas tengo?"]) assert.equal(parseConfirmation(other), null, other);

assert.equal(normalizePhone("+57 314-401 8901"), "573144018901", "teléfono solo dígitos");
assert.equal(withUploadNote("", [{ name: "a.pdf", url: "/uploads/a.pdf" }]), 'Subí este archivo.\n\n[Archivos subidos en el chat: "a.pdf" → /uploads/a.pdf]', "nota de archivos igual a la del chat");

const actor = { userId: "u1", role: "MEMBER", name: "Ana", channel: "whatsapp" as const };
const inside = await runAsUser(actor, async () => {
  await new Promise((r) => setTimeout(r, 5));
  return auth();
});
assert.equal(inside?.user.id, "u1", "auth() devuelve al usuario de WhatsApp dentro del contexto");
assert.equal(inside?.user.role, "MEMBER");
assert.equal(contextActor(), undefined, "fuera del contexto no queda identidad");
const outside = await Promise.resolve()
  .then(() => auth())
  .catch(() => null);
assert.notEqual(outside?.user?.id, "u1", "fuera del contexto no se usa la identidad de WhatsApp");

console.log("verify-whatsapp-chat: OK");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
