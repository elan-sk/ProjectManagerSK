import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { computeIndicators, rankByIntent, INDICATOR_CATALOG } from "../src/lib/companyIndicators";
import { appliedRulesText, createLearningsAs, learningVisibleWhere, promptLearningsOnce, updateLearningAs, validateLearning } from "../src/lib/learnings";

const TAG = `zz-learn-${Date.now()}`;

async function main() {
  assert.equal(validateLearning({ topic: "Plazos", title: "x", evidence: "sin cifras", recommendation: "y" }), "La evidencia tiene que citar cifras de los indicadores.");
  assert.equal(validateLearning({ topic: "Inventado", title: "x", evidence: "3 días", recommendation: "y" })?.startsWith("Tema no válido"), true);
  assert.equal(validateLearning({ topic: "Plazos", title: "x", evidence: "3 días", recommendation: "y" }), null);

  const ranked = rankByIntent(INDICATOR_CATALOG.map((c) => ({ key: c.key })), "Quiero ver cuántos errores hay en las pruebas de calidad");
  assert.ok(["common_errors", "test_rounds"].includes(ranked[0].key), "las pruebas y errores van primero");
  assert.equal(rankByIntent([{ key: "a" }, { key: "b" }], null)[0].key, "a");

  const member = { id: "nadie-verify", role: "MEMBER" };
  assert.ok(JSON.stringify(learningVisibleWhere(member)).includes('"personId":null'), "el PM nunca ve los de una persona");

  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", active: true }, select: { id: true, role: true } });
  const project = await prisma.project.create({ data: { name: `${TAG} p`, startDate: new Date(Date.now() - 20 * 86_400_000), pmId: admin.id, phases: { create: [{ name: "Fase", order: 0 }] } }, include: { phases: true } });
  try {
    await prisma.task.create({
      data: { projectId: project.id, phaseId: project.phases[0].id, title: "t", status: "COMPLETED", plannedStart: new Date(Date.now() - 10 * 86_400_000), plannedEnd: new Date(Date.now() - 5 * 86_400_000), actualEnd: new Date(Date.now() - 4 * 86_400_000) },
    });
    const ind = await computeIndicators({ projectIds: [project.id] });
    assert.equal(ind.length, 9);
    assert.ok(ind.find((i) => i.key === "duration")!.rows.length === 1, "duración con datos");
    assert.ok(ind.find((i) => i.key === "on_time")!.rows.length === 1, "a tiempo con datos");
    assert.equal(ind.find((i) => i.key === "adjustments")!.summary, "Sin datos.");

    assert.equal((await createLearningsAs(member, project.id, [{ topic: "Plazos", title: "x", evidence: "3 días", recommendation: "y" }], "app")).ok, false, "un miembro no crea");
    const pm = { id: admin.id, role: "MEMBER" };
    assert.equal((await createLearningsAs(pm, project.id, [{ topic: "Plazos", title: "x", evidence: "3 días", recommendation: "y", personId: admin.id }], "app")).ok, false, "el PM no crea sobre una persona");
    assert.equal((await createLearningsAs(pm, project.id, [{ topic: "Plazos", title: "x", evidence: "sin cifras", recommendation: "y" }], "app")).ok, false, "sin evidencia no se guarda");
    assert.equal((await createLearningsAs(pm, project.id, [{ topic: "Plazos", title: "Se atrasó", evidence: "1 día de atraso", recommendation: "Holgura" }], "claude")).ok, true);
    const l = await prisma.learning.findFirstOrThrow({ where: { projectId: project.id } });
    assert.equal(l.source, "claude");
    assert.equal((await updateLearningAs(pm, l.id, { status: "APPLIED" })).ok, true, "el PM marca el estado");
    assert.equal((await updateLearningAs(pm, l.id, { title: "otro" })).ok, false, "el PM no edita el texto");
    const withNumber = await prisma.learning.findUniqueOrThrow({ where: { id: l.id }, select: { number: true } });
    assert.match(await appliedRulesText(admin), new RegExp(`#${withNumber.number} \\[Plazos\\]`), "la aplicada entra como regla");
    await updateLearningAs(admin, l.id, { status: "DISCARDED" });
    assert.doesNotMatch(await appliedRulesText(admin), new RegExp(`#${withNumber.number} `), "la descartada no es regla");

    await prisma.learningPrompt.create({ data: { key: `${TAG}:prompt` } });
    assert.equal(await promptLearningsOnce(`${TAG}:prompt`, "x", null), false, "un solo aviso por evento");
  } finally {
    await prisma.task.deleteMany({ where: { projectId: project.id } });
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.learningPrompt.deleteMany({ where: { key: { startsWith: TAG } } });
  }
  console.log("verify:learnings ok");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
