import assert from "node:assert/strict";
import { orderDefinitionBySchedule } from "../src/lib/definitionOrder";

const definition = {
  phases: [{ id: "undated" }, { id: "late" }, { id: "early" }, { id: "tie" }],
  requirements: [
    { id: "empty", phases: [] },
    { id: "later", phases: [{ id: "late" }] },
    { id: "first", phases: [{ id: "late" }, { id: "early" }] },
  ],
  objectives: [
    { id: "empty", requirementIds: [] },
    { id: "later", requirementIds: ["later"] },
    { id: "first", requirementIds: ["first", "later"] },
  ],
};
const before = structuredClone(definition);
const result = orderDefinitionBySchedule(definition, [
  { phaseId: "early", plannedStart: new Date("2026-10-20") },
  { phaseId: "late", plannedStart: new Date("2026-10-10") },
  { phaseId: "early", plannedStart: new Date("2026-10-01") },
  { phaseId: "tie", plannedStart: new Date("2026-10-01") },
  { phaseId: null, plannedStart: new Date("2026-09-01") },
]);
assert.deepEqual(result.phases.map((p) => p.id), ["early", "tie", "late", "undated"]);
assert.deepEqual(result.requirements.map((r) => r.id), ["first", "later", "empty"]);
assert.deepEqual(result.objectives.map((o) => o.id), ["first", "later", "empty"]);
assert.deepEqual(definition, before, "The display order must not mutate the original definition");
assert.deepEqual(orderDefinitionBySchedule(definition, []), definition);
console.log("verify-definition-order: OK");
