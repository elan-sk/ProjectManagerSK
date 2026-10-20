import assert from "node:assert/strict";
import { summarizeRequirement } from "../src/lib/cascadeProgress";

const past = new Date("2020-01-01");
const future = new Date("2999-01-01");
const task = (id: string, status: string, plannedEnd = future) => ({ id, title: id, status, plannedEnd, type: "SIMPLE", steps: [], adjustmentItems: [], reviewRounds: [], attachments: [] });
const phase = (pct: number, overdueIds: string[] = []) => ({
  pct,
  atRisk: overdueIds.length > 0,
  overdueTasks: overdueIds.map((id) => ({ id, title: id, href: `/projects/p/tasks/${id}` })),
});

const sharedPhase = [phase(50)];
const done = summarizeRequirement([task("a", "COMPLETED"), task("b", "COMPLETED")], sharedPhase, "p");
const pending = summarizeRequirement([task("c", "NOT_STARTED"), task("d", "IN_PROGRESS")], sharedPhase, "p");
assert.equal(done.pct, 100, "dos requerimientos de la misma fase: cada uno con el avance de sus tareas");
assert.equal(pending.pct, 13, "spec 011: en curso sin checklist aporta 25 %, sin iniciar 0 %");
assert.equal(done.usesPhaseFallback, false);

const partial = summarizeRequirement([task("a", "COMPLETED"), task("b", "NOT_STARTED"), task("c", "NOT_STARTED")], [phase(100)], "p");
assert.equal(partial.pct, 33, "con tareas propias no se usan las fases");

const late = summarizeRequirement([task("late", "IN_PROGRESS", past), task("blocked", "BLOCKED", past), task("ok", "COMPLETED", past)], [], "p");
assert.equal(late.atRisk, true);
assert.deepEqual(late.atRiskTasks, [{ id: "late", title: "late", href: "/projects/p/tasks/late" }], "atrasada = abierta, no bloqueada, con fin vencido");

const fallback = summarizeRequirement([], [phase(40, ["x"]), phase(80, ["x", "y"])], "p");
assert.equal(fallback.usesPhaseFallback, true);
assert.equal(fallback.pct, 60, "sin tareas propias: promedio de sus fases");
assert.equal(fallback.atRisk, true);
assert.deepEqual(fallback.atRiskTasks.map((t) => t.id), ["x", "y"], "tareas atrasadas sin repetir");

const empty = summarizeRequirement([], [], "p");
assert.deepEqual(empty, { usesPhaseFallback: true, pct: 0, atRisk: false, atRiskTasks: [] }, "sin fases ni tareas: 0 %");

console.log("verify-requirement-progress: OK");
process.exit(0);
