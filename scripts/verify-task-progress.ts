import assert from "node:assert/strict";
import { taskProgress, progressPct } from "../src/lib/taskProgress";

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
// Ajuste: rechazado también cuenta como respondido.
assert.deepEqual(taskProgress({ ...base, type: "ADJUSTMENT", adjustmentItems: [{ clientApproval: false }, { clientApproval: true }, { clientApproval: null }] }), { done: 2, total: 3, unit: "puntos" });
// Sin puntos todavía: sin barra. Estos tipos ignoran pasos viejos del checklist.
assert.equal(taskProgress({ ...base, type: "QA", steps: [{ done: true }] }), null);
// El resto sigue con el checklist, aunque tenga rondas de revisión.
assert.deepEqual(taskProgress({ ...base, type: "SIMPLE", steps: [{ done: true }, { done: false }], reviewRounds: [round(null)] }), { done: 1, total: 2, unit: "pasos" });
assert.equal(taskProgress({ ...base, type: "SIMPLE" }), null);
console.log("OK — avance de tareas por pasos y por puntos respondidos");
