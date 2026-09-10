import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { propagateToSuccessors } from "../src/app/(app)/projects/[id]/actions";

// Chequeo de la regla de holgura/retraso (punto confirmado con el usuario):
// al completarse una tarea, sus sucesoras deben correrse contra su actualEnd
// real (no contra su plannedEnd planeado) — hacia atrás si terminó antes
// (holgura), hacia adelante si terminó después (retraso) — conservando la
// duración propia de cada sucesora y SIN tocar el plannedEnd de la
// predecesora (línea base para getTaskDelayDays/getUserPerformance/etc.).
// Corre contra la DB real (crea y borra sus propios datos).
async function main() {
  const user = await prisma.user.findFirstOrThrow();
  const project = await prisma.project.create({
    data: {
      name: "__verify-schedule-cascade__",
      startDate: new Date("2026-09-07"),
      pmId: user.id,
      phases: { create: [{ name: "F1", order: 0 }] },
    },
    include: { phases: true },
  });
  const phaseId = project.phases[0].id;

  try {
    // A: planeada lun 7 -> mié 9 (3 días hábiles). B depende de A
    // (termina antes de que esta empiece), planeada para arrancar jue 10 y
    // durar 2 días hábiles (10-11).
    const taskA = await prisma.task.create({
      data: {
        projectId: project.id,
        phaseId,
        title: "A",
        plannedStart: new Date("2026-09-07"),
        plannedEnd: new Date("2026-09-09"),
      },
    });
    const taskB = await prisma.task.create({
      data: {
        projectId: project.id,
        phaseId,
        title: "B",
        plannedStart: new Date("2026-09-10"),
        plannedEnd: new Date("2026-09-11"),
      },
    });
    await prisma.taskDependency.create({
      data: { predecessorId: taskA.id, successorId: taskB.id, type: "FINISH_TO_START" },
    });

    // Caso 1: A termina ANTES de tiempo (mar 8 en vez de mié 9) -> holgura de
    // 1 día hábil. B debía adelantarse un día hábil (arranca mié 9),
    // conservando sus 2 días hábiles de duración (9-10).
    await prisma.task.update({
      where: { id: taskA.id },
      data: { status: "COMPLETED", actualStart: new Date("2026-09-07"), actualEnd: new Date("2026-09-08") },
    });
    await prisma.$transaction((tx) => propagateToSuccessors(tx, project.countryCode, taskA.id));

    let b = await prisma.task.findUniqueOrThrow({ where: { id: taskB.id } });
    let a = await prisma.task.findUniqueOrThrow({ where: { id: taskA.id } });
    assert.equal(iso(b.plannedStart), "2026-09-09", `Holgura: B debía adelantarse al 9, dio ${iso(b.plannedStart)}`);
    assert.equal(iso(b.plannedEnd), "2026-09-10", `Holgura: B debía durar hasta el 10, dio ${iso(b.plannedEnd)}`);
    assert.equal(iso(a.plannedEnd), "2026-09-09", "El plannedEnd de A (línea base) no debía tocarse");

    // Caso 2: A en realidad termina DESPUÉS de tiempo (vie 11 en vez de mié
    // 9) -> retraso de 2 días hábiles. B debía correrse hacia adelante
    // (arranca lun 14).
    await prisma.task.update({ where: { id: taskA.id }, data: { actualEnd: new Date("2026-09-11") } });
    await prisma.$transaction((tx) => propagateToSuccessors(tx, project.countryCode, taskA.id));

    b = await prisma.task.findUniqueOrThrow({ where: { id: taskB.id } });
    a = await prisma.task.findUniqueOrThrow({ where: { id: taskA.id } });
    assert.equal(iso(b.plannedStart), "2026-09-14", `Retraso: B debía atrasarse al 14, dio ${iso(b.plannedStart)}`);
    assert.equal(iso(a.plannedEnd), "2026-09-09", "El plannedEnd de A (línea base) no debía tocarse");

    console.log("OK: holgura corre sucesoras hacia atrás y retraso hacia adelante, sin tocar el plannedEnd de la predecesora.");
  } finally {
    await prisma.project.delete({ where: { id: project.id } });
  }
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

main()
  .catch((err) => {
    console.error("FALLÓ:", err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
