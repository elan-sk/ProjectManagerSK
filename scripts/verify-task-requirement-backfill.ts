import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";

const ROLLBACK = "rollback";
const backfillSql = readFileSync("prisma/migrations/20261011120000_task_requirement/migration.sql", "utf8")
  .split("-- Backfill")[1]
  .trim()
  .replace(/;$/, "");

async function main() {
  await prisma
    .$transaction(
      async (tx) => {
        const stamp = Date.now();
        const pm = await tx.user.create({ data: { name: "__vb_pm", username: `__vb_pm_${stamp}`, passwordHash: "x" } });
        const mkProject = (name: string) => tx.project.create({ data: { name: `__vb_${name}_${stamp}`, startDate: new Date("2026-10-01"), pmId: pm.id } });
        const [project, other] = [await mkProject("main"), await mkProject("other")];
        const mkRequirement = (projectId: string, title: string, order: number) => tx.requirement.create({ data: { projectId, title, order } });
        const r1 = await mkRequirement(project.id, "r1", 0);
        const r2 = await mkRequirement(project.id, "r2", 1);
        const foreign = await mkRequirement(other.id, "foreign", 0);
        const mkPhase = (name: string, order: number, requirementIds: string[]) =>
          tx.phase.create({ data: { projectId: project.id, name, order, requirements: { connect: requirementIds.map((id) => ({ id })) } } });
        const single = await mkPhase("single", 0, [r1.id]);
        const shared = await mkPhase("shared", 1, [r1.id, r2.id]);
        const none = await mkPhase("none", 2, []);
        const crossed = await mkPhase("crossed", 3, [foreign.id]);
        const mkTask = (phaseId: string, title: string, requirementIds: string[] = []) =>
          tx.task.create({
            data: { projectId: project.id, phaseId, title, plannedStart: new Date("2026-10-01"), plannedEnd: new Date("2026-10-02"), requirements: { connect: requirementIds.map((id) => ({ id })) } },
          });
        const tasks = {
          single: await mkTask(single.id, "single"),
          singleKept: await mkTask(single.id, "singleKept", [r2.id]),
          shared: await mkTask(shared.id, "shared"),
          none: await mkTask(none.id, "none"),
          crossed: await mkTask(crossed.id, "crossed"),
        };
        const phaseLinks = () => tx.phase.findMany({ where: { projectId: project.id }, select: { id: true, requirements: { select: { id: true }, orderBy: { id: "asc" } } }, orderBy: { order: "asc" } });
        const linksBefore = await phaseLinks();

        await tx.$executeRawUnsafe(backfillSql);
        await tx.$executeRawUnsafe(backfillSql);

        const requirementsOf = async (taskId: string) =>
          (await tx.task.findUniqueOrThrow({ where: { id: taskId }, select: { requirements: { select: { id: true } } } })).requirements.map((r) => r.id).sort();
        const both = [r1.id, r2.id].sort();
        assert.deepEqual(await requirementsOf(tasks.single.id), [r1.id], "fase con un requerimiento: la tarea lo hereda");
        assert.deepEqual(await requirementsOf(tasks.singleKept.id), both, "una tarea ya vinculada conserva lo suyo y suma el de su fase");
        assert.deepEqual(await requirementsOf(tasks.shared.id), both, "fase con varios requerimientos: la tarea los hereda todos, una sola vez");
        assert.deepEqual(await requirementsOf(tasks.none.id), [], "fase sin requerimiento: sin requerimiento");
        assert.deepEqual(await requirementsOf(tasks.crossed.id), [], "requerimiento de otro proyecto: no se asigna");
        assert.deepEqual(await phaseLinks(), linksBefore, "los vínculos Requerimiento–Fase no cambian");

        await tx.requirement.delete({ where: { id: r1.id } });
        assert.deepEqual(await requirementsOf(tasks.single.id), [], "eliminar el requerimiento deja la tarea sin requerimiento");
        assert.deepEqual(await requirementsOf(tasks.shared.id), [r2.id], "y conserva los demás");
        assert.equal(await tx.task.count({ where: { projectId: project.id } }), 5, "no se elimina ninguna tarea");

        throw new Error(ROLLBACK);
      },
      { timeout: 30000 },
    )
    .catch((err: Error) => {
      if (err.message !== ROLLBACK) throw err;
    });
  console.log("verify-task-requirement-backfill: OK");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
