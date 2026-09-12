import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { getTaskAlert } from "../src/lib/delays";

// Chequeo de la alerta nueva (pedida por el usuario): tarea NOT_STARTED cuya
// plannedStart ya pasó pero plannedEnd todavía no — "debería estar en curso
// pero no se ha iniciado". Suave (≤2 días hábiles) escala a grave/"overdue"
// (mismo rojo que una tarea vencida) al superar ese umbral.
async function main() {
  const user = await prisma.user.findFirstOrThrow();
  const project = await prisma.project.create({
    data: {
      name: "__verify-late-start-alert__",
      startDate: new Date("2026-09-01"),
      pmId: user.id,
      phases: { create: [{ name: "F1", order: 0 }] },
    },
    include: { phases: true },
  });
  const phaseId = project.phases[0].id;

  try {
    // Debía iniciar ayer, sigue sin arrancar -> alerta suave.
    const softTask = await prisma.task.create({
      data: {
        projectId: project.id,
        phaseId,
        title: "Suave",
        plannedStart: new Date("2026-09-10"),
        plannedEnd: new Date("2026-09-25"),
      },
    });

    // Debía iniciar hace una semana, sigue sin arrancar -> alerta grave.
    const criticalTask = await prisma.task.create({
      data: {
        projectId: project.id,
        phaseId,
        title: "Grave",
        plannedStart: new Date("2026-09-04"),
        plannedEnd: new Date("2026-09-25"),
      },
    });

    // Ya arrancó (IN_PROGRESS) aunque su plannedStart también pasó -> no debe
    // dispararse la alerta de "no iniciada", cae en el chequeo normal.
    const startedTask = await prisma.task.create({
      data: {
        projectId: project.id,
        phaseId,
        title: "Ya arrancada",
        plannedStart: new Date("2026-09-04"),
        plannedEnd: new Date("2026-10-01"),
        status: "IN_PROGRESS",
        actualStart: new Date("2026-09-04"),
      },
    });

    const softAlert = await getTaskAlert(project.countryCode, softTask);
    const criticalAlert = await getTaskAlert(project.countryCode, criticalTask);
    const startedAlert = await getTaskAlert(project.countryCode, startedTask);

    assert.equal(softAlert.level, "lateStart", `Suave debía dar "lateStart", dio "${softAlert.level}"`);
    assert.ok(softAlert.businessDaysOverdue <= 2, `Suave debía tener ≤2 días hábiles, dio ${softAlert.businessDaysOverdue}`);

    assert.equal(criticalAlert.level, "overdue", `Grave debía escalar a "overdue", dio "${criticalAlert.level}"`);
    assert.ok(criticalAlert.businessDaysOverdue > 2, `Grave debía tener >2 días hábiles, dio ${criticalAlert.businessDaysOverdue}`);

    assert.notEqual(startedAlert.level, "lateStart", "Una tarea IN_PROGRESS no debe dar 'lateStart'");

    console.log("OK: lateStart suave, escalamiento a overdue tras 2 días hábiles, e IN_PROGRESS no dispara la alerta.");
  } finally {
    await prisma.project.delete({ where: { id: project.id } });
  }
}

main()
  .catch((err) => {
    console.error("FALLÓ:", err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
