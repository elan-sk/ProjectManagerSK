import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { getTaskDelayDays } from "../src/lib/delays";

// Chequeo de la regla más importante y menos trivial del sistema (punto 11
// del manuscrito, confirmada con el usuario): una tarea es responsable de
// atraso solo por SU PROPIA duración real vs. planeada — nunca por haber
// arrancado tarde a causa de una predecesora. Corre contra la DB real
// (crea y borra sus propios datos) porque la lógica vive detrás de Prisma.
async function main() {
  const user = await prisma.user.findFirstOrThrow();
  const project = await prisma.project.create({
    data: {
      name: "__verify-delay-rule__",
      startDate: new Date("2026-09-07"),
      pmId: user.id,
      phases: { create: [{ name: "F1", order: 0 }] },
    },
    include: { phases: true },
  });
  const phaseId = project.phases[0].id;

  try {
    // A: planeada lun 7 -> mié 9 (3 días hábiles), pero se demoró hasta el
    // viernes 11 (5 días hábiles reales) -> A generó 2 días de atraso propio.
    const taskA = await prisma.task.create({
      data: {
        projectId: project.id,
        phaseId,
        title: "A",
        plannedStart: new Date("2026-09-07"),
        plannedEnd: new Date("2026-09-09"),
        actualStart: new Date("2026-09-07"),
        actualEnd: new Date("2026-09-11"),
        status: "COMPLETED",
      },
    });

    // B: planeada para arrancar el 10, pero como A terminó el 11, arranca el
    // 14 (lunes siguiente) y cumple su propia duración planeada (2 días
    // hábiles) -> B no generó ningún atraso propio, aunque empezó tarde.
    const taskB = await prisma.task.create({
      data: {
        projectId: project.id,
        phaseId,
        title: "B",
        plannedStart: new Date("2026-09-10"),
        plannedEnd: new Date("2026-09-11"),
        actualStart: new Date("2026-09-14"),
        actualEnd: new Date("2026-09-15"),
        status: "COMPLETED",
      },
    });

    const delayA = await getTaskDelayDays(project.countryCode, taskA);
    const delayB = await getTaskDelayDays(project.countryCode, taskB);

    assert.equal(delayA, 2, `A debía generar 2 días de atraso propio, dio ${delayA}`);
    assert.equal(delayB, 0, `B no debía generar atraso (cumplió su propia duración), dio ${delayB}`);

    console.log("OK: la responsabilidad de atraso quedó en A (2 días), no en B (0 días).");
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
