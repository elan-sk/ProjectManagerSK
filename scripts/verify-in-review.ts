import assert from "node:assert/strict";
import { isTaskInReview, matchesStatusFilter, taskStatusLabels } from "../src/lib/statusColors";
import { pickResponseCategory, sameResponse } from "../src/lib/responseTemplates";

const open = [{ outcome: "APPROVED" }, { outcome: null }];
const closed = [{ outcome: "RETURNED" }];

// Solo Prueba (QA) con una ronda sin resultado; las Aceptaciones no cuentan.
assert.equal(isTaskInReview({ type: "QA", reviewRounds: open }), true);
assert.equal(isTaskInReview({ type: "QA", reviewRounds: closed }), false);
assert.equal(isTaskInReview({ type: "QA", reviewRounds: [] }), false);
assert.equal(isTaskInReview({ type: "ACCEPTANCE", reviewRounds: open }), false);

// Filtro Estado: «En revisión» mira las rondas; los estados reales, el campo status.
const inReview = { status: "IN_PROGRESS", type: "QA", reviewRounds: open };
assert.equal(matchesStatusFilter("IN_REVIEW", inReview), true);
assert.equal(matchesStatusFilter("IN_PROGRESS", inReview), true);
assert.equal(matchesStatusFilter("IN_REVIEW", { ...inReview, reviewRounds: closed }), false);
assert.equal(matchesStatusFilter(undefined, inReview), true);

// Buscador «estados:…»: la tarea se encuentra por su estado real y por «En revisión».
assert.deepEqual(taskStatusLabels({ status: "IN_PROGRESS", type: "QA", reviewRounds: open }), ["En curso", "En revisión"]);
assert.deepEqual(taskStatusLabels({ status: "RETURNED", type: "QA", reviewRounds: closed }), ["Devuelta"]);
// Respuestas guardadas: la categoría con el nombre de la prueba (sin importar tildes) o, si no hay, «Otro».
const cats = [{ name: "Diseño" }, { name: "Otro" }];
assert.equal(pickResponseCategory(cats, "diseno")?.name, "Diseño");
assert.equal(pickResponseCategory(cats, "Seguridad")?.name, "Otro");
assert.equal(pickResponseCategory(cats, null)?.name, "Otro");
assert.equal(pickResponseCategory([{ name: "Diseño" }], "Seguridad"), undefined);
assert.equal(sameResponse("Validación  faltante", "validacion faltante "), true);
assert.equal(sameResponse("Validación faltante", "Texto cortado"), false);
console.log("OK: estado «En revisión» y respuestas guardadas");
