import assert from "node:assert/strict";
import { taskContribution, averageContribution, forecastRemainingShare, type ContributionTask } from "../src/lib/taskProgress";
import { buildProjectForecast, type ForecastTask } from "../src/lib/scheduleForecast";

const t = (over: Partial<ContributionTask>): ContributionTask => ({
  type: "SIMPLE",
  status: "IN_PROGRESS",
  steps: [],
  adjustmentItems: [],
  reviewRounds: [],
  attachments: [],
  ...over,
});
const steps = (done: number, total: number) => Array.from({ length: total }, (_, i) => ({ done: i < done }));
const round = (outcome: string | null, ...results: (string | null)[]) => ({ outcome, checks: results.map((result) => ({ result })) });

assert.equal(taskContribution(t({ status: "COMPLETED", steps: steps(0, 4) })), 100);
assert.equal(taskContribution(t({ status: "NOT_STARTED", steps: steps(3, 4) })), 0);
assert.equal(taskContribution(t({ steps: steps(3, 5) })), 60);
assert.equal(taskContribution(t({ steps: steps(5, 5) })), 90);
assert.equal(taskContribution(t({})), 25);
assert.equal(taskContribution(t({ steps: [] })), 25);
assert.equal(taskContribution(t({ status: "BLOCKED", steps: steps(1, 4) })), 25);
assert.equal(taskContribution(t({ status: "RETURNED", steps: steps(2, 4) })), 50);

assert.equal(taskContribution(t({ type: "QA", reviewRounds: [round(null, null, null)] })), 90);
assert.equal(taskContribution(t({ type: "QA", reviewRounds: [round("APPROVED", "APPROVED")] })), 90);
assert.equal(taskContribution(t({ type: "QA", reviewRounds: [round("RETURNED", "APPROVED", "FAILED"), round(null, null, null)] })), 90);
assert.equal(taskContribution(t({ type: "QA", status: "RETURNED", reviewRounds: [round("RETURNED", "APPROVED", "FAILED")] })), 90);
assert.equal(taskContribution(t({ type: "QA", status: "RETURNED", reviewRounds: [round("RETURNED", "APPROVED", "FAILED", null, null)] })), 50);
assert.equal(taskContribution(t({ type: "ACCEPTANCE", reviewRounds: [round(null, null)] })), 90);
assert.equal(taskContribution(t({ type: "MILESTONE", attachments: [{ kind: "RESULTADO" }] })), 90);
assert.equal(taskContribution(t({ type: "MILESTONE", steps: steps(1, 2) })), 50);
assert.equal(taskContribution(t({ type: "ADJUSTMENT", adjustmentItems: [{ attachments: [{ kind: "AFTER" }] }, { attachments: [] }] })), 50);

assert.equal(averageContribution([]), 0);
assert.equal(
  averageContribution([
    t({ status: "COMPLETED" }),
    t({ steps: steps(3, 5) }),
    t({ type: "QA", reviewRounds: [round(null, null)] }),
    t({ status: "NOT_STARTED" }),
  ]),
  63
);

assert.equal(forecastRemainingShare(t({ type: "QA", reviewRounds: [round(null, null)] })), 0);
assert.equal(forecastRemainingShare(t({})), 0.75);

const d = (s: string) => new Date(`2026-09-${s}T00:00:00Z`);
const TODAY = d("16");
let n = 0;
const ft = (end: string, remainingShare?: number): ForecastTask => ({ id: `f${++n}`, title: `F${n}`, status: "IN_PROGRESS", plannedStart: d("01"), plannedEnd: d(end), actualEnd: null, remainingShare });
const endOf = async (task: ForecastTask) => (await buildProjectForecast("CO", null, [task], [], TODAY)).tasks.get(task.id)!.end.toISOString().slice(0, 10);

async function main() {
  assert.equal(await endOf(ft("10")), "2026-09-28", "sin dato: duración completa de 8 días hábiles, como antes");
  assert.equal(await endOf(ft("10", 0.1)), "2026-09-17", "al 90 % de 8 días: 1 día");
  assert.equal(await endOf(ft("10", 0)), "2026-09-17", "en revisión: 1 día");
  assert.equal(await endOf(ft("10", 0.5)), "2026-09-22", "a la mitad: 4 días");
  console.log("verify-task-contribution: OK");
}
main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
