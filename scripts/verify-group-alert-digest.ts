// Verifica el mensaje único de alertas de grupo (buildGroupAlertText): agrupado por tipo, UN link por
// tipo, siempre al Panorama general filtrado, menciones sin repetir ni
// mencionar a quien no tiene teléfono.
process.env.NEXTAUTH_URL = "https://sitio.test";
import assert from "node:assert/strict";
import { buildGroupAlertText } from "../src/lib/notifications";

const e = (type: string, taskId: string, projectId: string, message: string, ids: string[]) => ({ message, taskId, projectId, type, userIds: new Set(ids) });
const names = new Map([["p1", "Quibdó"], ["p2", "Pagüer"]]);
const phones = new Map([["u1", "573001"], ["u2", "573002"], ["u3", "573003"]]);
const show = (t: string) => t.replaceAll(" ", "·");

// --- un solo proyecto
const one = new Map([
  ["p1", new Map([
    ["RETURNED|t3", e("RETURNED", "t3", "p1", '"Prueba de caja" fue devuelta.', ["u3"])],
    ["OVERDUE|t1", e("OVERDUE", "t1", "p1", '"Reunión CRM" está vencida (debía terminar el 18/9/2026).', ["u1", "u2", "u9"])],
    ["OVERDUE|t5", e("OVERDUE", "t5", "p1", '"Definir campos" está vencida.', ["u1"])],
    ["BLOCKED|t2", e("BLOCKED", "t2", "p1", '"Pagos" está bloqueada.', ["u2"])],
  ])],
]);
const a = buildGroupAlertText(one, names, phones);
console.log(show(a.text), "\n");
assert.ok(a.text.startsWith("🔔 *ALERTAS PENDIENTES* (4)\n📁 *Quibdó*"), "cuenta y proyecto");
assert.ok(a.text.includes("🔴 *VENCIDAS* (2)\n  🔗 https://sitio.test/projects?risk=overdue"), "un link por tipo, al Panorama general filtrado");
assert.equal(a.text.match(/🔗/g)?.length, 3, "un link por tipo (vencidas, bloqueadas, devueltas), no por alerta");
assert.ok(a.text.indexOf("VENCIDAS") < a.text.indexOf("BLOQUEADAS") && a.text.indexOf("BLOQUEADAS") < a.text.indexOf("DEVUELTAS"), "de más a menos grave");
assert.ok(a.text.includes('*Reunión CRM* está vencida (debía terminar el 18 sep)') && !a.text.includes('2026'), "fecha corta: día y mes en letras");
assert.ok(a.text.includes('*Definir campos* está vencida.\n\u2003\u2003👤 @573001 @573002\n'), "menciones juntas al final del grupo de vencidas, sin repetir");
assert.equal(a.text.match(/👤/g)?.length, 3, "una línea de menciones por grupo de alertas");
assert.ok(!a.text.includes("u9") && !a.text.includes("@undefined") && !a.text.includes("/tasks/"), "sin ids sueltos ni links por tarea");
assert.deepEqual([...a.mentionedIds].sort(), ["u1", "u2", "u3"], "menciones reales sin repetidos");

// --- varios proyectos: link al Panorama general y nombre del proyecto en cada alerta
const many = new Map([
  ["p1", new Map([["OVERDUE|t1", e("OVERDUE", "t1", "p1", '"Reunión CRM" está vencida.', ["u1"])]])],
  ["p2", new Map([["OVERDUE|t4", e("OVERDUE", "t4", "p2", '"Manual" está vencida.', ["u2"])]])],
]);
const b = buildGroupAlertText(many, names, phones);
console.log(show(b.text));
assert.ok(b.text.includes("🔴 *VENCIDAS* (2)\n  🔗 https://sitio.test/projects?risk=overdue"), "Panorama general filtrado");
assert.ok(b.text.includes("_Quibdó_ · *Reunión CRM*") && b.text.includes("_Pagüer_ · *Manual*"), "proyecto en cada alerta");
assert.equal(b.text.match(/🔗/g)?.length, 1, "un solo link para las dos vencidas");
console.log("verify-group-alert-digest: OK");
