import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { applyGroupMove } from "../src/app/(app)/projects/[id]/actions";

// Chequeo del recorte de delta en applyGroupMove/moveTaskGroup (punto confirmado con el
// usuario): arrastrar un grupo hacia atrás se recorta al máximo que no viole
// una dependencia hacia una tarea FUERA del grupo — nunca se rechaza todo el
// movimiento, y una dependencia INTERNA al grupo (predecesora también
// seleccionada) no debe frenar nada, porque ambas se mueven juntas.
// Corre contra la DB real (crea y borra sus propios datos).
async function main() {
  const user = await prisma.user.findFirstOrThrow();
  const project = await prisma.project.create({
    data: {
      name: "__verify-move-task-group__",
      startDate: new Date("2026-09-07"),
      pmId: user.id,
      phases: { create: [{ name: "F1", order: 0 }] },
    },
    include: { phases: true },
  });
  const phaseId = project.phases[0].id;

  try {
    // X: fuera del grupo, sin dependencias. lun 7 -> mié 9.
    const taskX = await prisma.task.create({
      data: { projectId: project.id, phaseId, title: "X", plannedStart: new Date("2026-09-07"), plannedEnd: new Date("2026-09-09") },
    });
    // A: en el grupo, depende de X (externa) -> mínimo posible jue 10.
    // Planeada con holgura (arranca mar 15), da slack de 3 días hábiles.
    const taskA = await prisma.task.create({
      data: { projectId: project.id, phaseId, title: "A", plannedStart: new Date("2026-09-15"), plannedEnd: new Date("2026-09-16") },
    });
    // B: en el grupo, depende de A (interna al grupo) -> no debe frenar nada.
    const taskB = await prisma.task.create({
      data: { projectId: project.id, phaseId, title: "B", plannedStart: new Date("2026-09-17"), plannedEnd: new Date("2026-09-18") },
    });
    await prisma.taskDependency.create({ data: { predecessorId: taskX.id, successorId: taskA.id, type: "FINISH_TO_START" } });
    await prisma.taskDependency.create({ data: { predecessorId: taskA.id, successorId: taskB.id, type: "FINISH_TO_START" } });

    // Se pide arrastrar 5 días hábiles hacia atrás; A solo tiene 3 de
    // holgura contra X (externa) -> el grupo entero debe recortarse a -3.
    const result = await applyGroupMove([taskA.id, taskB.id], -5);
    assert.equal(result.ok, true, "applyGroupMove debía aceptar la operación (recortada, no rechazada)");
    assert.equal(result.appliedDelta, -3, `Delta recortado esperado -3, dio ${result.appliedDelta}`);

    const [x, a, b] = await Promise.all([
      prisma.task.findUniqueOrThrow({ where: { id: taskX.id } }),
      prisma.task.findUniqueOrThrow({ where: { id: taskA.id } }),
      prisma.task.findUniqueOrThrow({ where: { id: taskB.id } }),
    ]);

    assert.equal(iso(x.plannedStart), "2026-09-07", "X (fuera del grupo) no debía moverse");
    assert.equal(iso(a.plannedStart), "2026-09-10", `A debía quedar exactamente en su mínimo (10), dio ${iso(a.plannedStart)}`);
    assert.equal(iso(a.plannedEnd), "2026-09-11", `Duración de A debía conservarse, dio fin ${iso(a.plannedEnd)}`);
    // B se mueve el MISMO delta que A (mismo grupo), pese a no tener holgura
    // propia contra su predecesora externa (A, que va con ella).
    assert.equal(iso(b.plannedStart), "2026-09-14", `B debía moverse el mismo delta que A (14), dio ${iso(b.plannedStart)}`);
    assert.equal(iso(b.plannedEnd), "2026-09-15", `Duración de B debía conservarse, dio fin ${iso(b.plannedEnd)}`);

    console.log("OK: moveTaskGroup recorta el delta del grupo a la dependencia externa más restrictiva, ignora las internas.");
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
