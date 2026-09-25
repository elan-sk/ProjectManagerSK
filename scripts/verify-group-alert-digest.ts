// Verifica el mensaje único de alertas de grupo (buildGroupAlertText): corto, agrupado por proyecto (UN
// link por proyecto), dentro de cada uno las alertas por tipo con solo el nombre de la tarea, y las
// menciones del proyecto al final, sin repetir ni mencionar a quien no tiene teléfono.
process.env.NEXTAUTH_URL = "https://sitio.test";
import assert from "node:assert/strict";
import { buildGroupAlertText } from "../src/lib/notifications";

const e = (type: string, taskId: string, projectId: string, message: string, ids: string[]) => ({ message, taskId, projectId, type, userIds: new Set(ids) });
const names = new Map([["p1", "Quibdó"], ["p2", "Pagüer"]]);
const phones = new Map([["u1", "573001"], ["u2", "573002"], ["u3", "573003"]]);
const show = (t: string) => t.replaceAll(" ", "·");

const byProject = new Map([
  ["p1", new Map([
    ["RETURNED|t3", e("RETURNED", "t3", "p1", '"Prueba de caja" fue devuelta.', ["u3"])],
    ["OVERDUE|t1", e("OVERDUE", "t1", "p1", '"Reunión CRM" está vencida (debía terminar el 18/9/2026).', ["u1", "u2", "u9"])],
    ["OVERDUE|t5", e("OVERDUE", "t5", "p1", '"Definir campos" está vencida.', ["u1"])],
    ["BLOCKED|t2", e("BLOCKED", "t2", "p1", '"Pagos" está bloqueada.', ["u2"])],
  ])],
  ["p2", new Map([["OVERDUE|t4", e("OVERDUE", "t4", "p2", '"Manual" está vencida.', ["u2"])]])],
]);
const a = buildGroupAlertText(byProject, names, phones);
console.log(show(a.text));
assert.ok(a.text.startsWith("🔔 *ALERTAS PENDIENTES* (5)\n\n📁 *Quibdó*\n🔗 https://sitio.test/projects/p1\n🔴 *VENCIDAS* (2)"), "cuenta, proyecto, link y primera alarma");
assert.equal(a.text.match(/🔗/g)?.length, 2, "un link por proyecto, no por alerta ni por tipo");
assert.equal(a.text.match(/📁/g)?.length, 2, "cada proyecto una sola vez");
const p1 = a.text.slice(0, a.text.indexOf("📁 *Pagüer*"));
assert.ok(p1.indexOf("VENCIDAS") < p1.indexOf("BLOQUEADAS") && p1.indexOf("BLOQUEADAS") < p1.indexOf("DEVUELTAS"), "de más a menos grave dentro del proyecto");
assert.ok(a.text.includes("  • *Reunión CRM*\n") && !a.text.includes("vencida") && !a.text.includes("2026"), "solo el nombre de la tarea");
assert.ok(p1.includes("👤 @573001 @573002 @573003"), "menciones del proyecto juntas al final, sin repetir");
assert.ok(a.text.endsWith("📁 *Pagüer*\n🔗 https://sitio.test/projects/p2\n🔴 *VENCIDAS* (1)\n  • *Manual*\n👤 @573002"), "cada proyecto con sus propias menciones");
assert.ok(!a.text.includes("u9") && !a.text.includes("@undefined") && !a.text.includes("/tasks/"), "sin ids sueltos ni links por tarea");
assert.deepEqual([...a.mentionedIds].sort(), ["u1", "u2", "u3"], "menciones reales sin repetidos");
console.log("verify-group-alert-digest: OK");
