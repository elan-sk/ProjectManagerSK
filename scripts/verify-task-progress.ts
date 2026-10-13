import assert from "node:assert/strict";
import { taskProgress, progressPct, deliverableEvidenceLoaded } from "../src/lib/taskProgress";
import { shouldAutoStart } from "../src/lib/taskAutoStart";

const base = { steps: [], adjustmentItems: [], reviewRounds: [] };
const round = (...results: (string | null)[]) => ({ checks: results.map((result) => ({ result })) });

// Prueba: una ronda respondida completa = 100 %; al enviar una segunda sin responder = 50 %.
const one = taskProgress({ ...base, type: "QA", reviewRounds: [round("APPROVED", "FAILED")] })!;
assert.equal(progressPct(one), 100);
const two = taskProgress({ ...base, type: "QA", reviewRounds: [round("APPROVED", "FAILED"), round(null, null)] })!;
assert.deepEqual(two, { done: 2, total: 4, unit: "puntos" });
assert.equal(progressPct(two), 50);
// Cuenta la respuesta, no su signo: «No aplica» y «Con errores» también son respuestas.
assert.equal(taskProgress({ ...base, type: "ACCEPTANCE", reviewRounds: [round("NOT_APPLICABLE", "FAILED", null)] })!.done, 2);
// Ajuste: respondido = tiene «Después»; una nota, el «Antes» o un insumo no cuentan.
const item = (note: string | null, ...kinds: string[]) => ({ note, attachments: kinds.map((kind) => ({ kind })) });
assert.deepEqual(
  taskProgress({ ...base, type: "ADJUSTMENT", adjustmentItems: [item(null, "BEFORE", "AFTER"), item("Hecho"), item(null, "BEFORE", "INSUMO"), item(null)] }),
  { done: 1, total: 4, unit: "puntos" }
);
// Caso real: cuatro cambios con «Antes» y nota pero sin «Después» = 0 %, no 100 %.
assert.equal(progressPct(taskProgress({ ...base, type: "ADJUSTMENT", adjustmentItems: [1, 2, 3, 4].map(() => item("Según la imagen", "BEFORE")) })!), 0);
// Sin puntos todavía: sin barra. Estos tipos ignoran pasos viejos del checklist.
assert.equal(taskProgress({ ...base, type: "QA", steps: [{ done: true }] }), null);
// El resto sigue con el checklist, aunque tenga rondas de revisión.
assert.deepEqual(taskProgress({ ...base, type: "SIMPLE", steps: [{ done: true }, { done: false }], reviewRounds: [round(null)] }), { done: 1, total: 2, unit: "pasos" });
assert.equal(taskProgress({ ...base, type: "SIMPLE" }), null);
// Entregable: evidencia cargada solo con un «Resultado»; un insumo no cuenta, ni otro tipo de tarea.
assert.equal(deliverableEvidenceLoaded({ type: "MILESTONE", attachments: [{ kind: "INSUMO" }, { kind: "RESULTADO" }] }), true);
assert.equal(deliverableEvidenceLoaded({ type: "MILESTONE", attachments: [{ kind: "INSUMO" }] }), false);
assert.equal(deliverableEvidenceLoaded({ type: "SIMPLE", attachments: [{ kind: "RESULTADO" }] }), false);
// Arranque automático: «Sin iniciar» → «En curso» con el primer trabajo real de cada tipo.
const ns = (type: "SIMPLE" | "MILESTONE" | "QA" | "ADJUSTMENT" | "ACCEPTANCE", stepsCount = 0) => ({ status: "NOT_STARTED" as const, type, stepsCount });
assert.equal(shouldAutoStart(ns("ADJUSTMENT"), "ADJUSTMENT_AFTER"), true);
assert.equal(shouldAutoStart(ns("QA"), "ROUND_SUBMITTED"), true);
assert.equal(shouldAutoStart(ns("ACCEPTANCE"), "ROUND_SUBMITTED"), true);
assert.equal(shouldAutoStart(ns("MILESTONE"), "RESULTADO"), true);
assert.equal(shouldAutoStart(ns("SIMPLE", 2), "STEP_DONE"), true);
// Un resultado en una tarea simple sin checklist no la arranca (como antes); con checklist sí.
assert.equal(shouldAutoStart(ns("SIMPLE"), "RESULTADO"), false);
assert.equal(shouldAutoStart(ns("SIMPLE", 1), "RESULTADO"), true);
// Solo desde «Sin iniciar»: nunca saca una tarea de Bloqueada, Devuelta o Completada.
for (const status of ["BLOCKED", "RETURNED", "COMPLETED", "IN_PROGRESS"] as const) {
  assert.equal(shouldAutoStart({ status, type: "ADJUSTMENT", stepsCount: 0 }, "ADJUSTMENT_AFTER"), false);
}
console.log("OK — avance de tareas por pasos y por puntos respondidos, y arranque automático");
