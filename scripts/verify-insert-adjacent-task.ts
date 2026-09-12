import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { insertAdjacentTaskCore } from "../src/app/(app)/projects/[id]/actions";

// Chequeo de "Crear predecesor"/"Crear sucesor" del menú contextual del
// Gantt: la tarea nueva debe compartir fase con la de origen y, si ese lado
// ya tenía un vínculo directo, insertarse EN MEDIO (cortando el vínculo
// viejo y recableando a través de la nueva) en vez de coexistir con él —
// empujando en cascada lo que sigue. Corre contra la DB real (crea y borra
// sus propios datos).
async function main() {
  const user = await prisma.user.findFirstOrThrow();
  const project = await prisma.project.create({
    data: {
      name: "__verify-insert-adjacent-task__",
      startDate: new Date("2026-09-07"),
      pmId: user.id,
      phases: { create: [{ name: "F1", order: 0 }] },
    },
    include: { phases: true },
  });
  const phaseId = project.phases[0].id;

  const baseData = {
    title: "nueva",
    type: "SIMPLE" as const,
    description: null,
    durationDays: 1,
    assigneeIds: [user.id],
  };

  try {
    // Caso 1 ("Crear sucesor" insertando EN MEDIO): A -> C ya existe.
    // Insertar B como sucesor de A debe cortar A->C y dejar A->B->C, y
    // empujar a C en cascada a partir del fin real de B.
    const A = await prisma.task.create({
      data: { projectId: project.id, phaseId, title: "A", plannedStart: new Date("2026-09-07"), plannedEnd: new Date("2026-09-08") },
    });
    const C = await prisma.task.create({
      data: { projectId: project.id, phaseId, title: "C", plannedStart: new Date("2026-09-09"), plannedEnd: new Date("2026-09-09") },
    });
    const oldLinkAC = await prisma.taskDependency.create({
      data: { predecessorId: A.id, successorId: C.id, type: "FINISH_TO_START" },
    });

    const bId = await insertAdjacentTaskCore(A.id, "successor", { ...baseData, title: "B", plannedStart: new Date("2026-09-07") });
    const B = await prisma.task.findUniqueOrThrow({ where: { id: bId } });
    const cAfter = await prisma.task.findUniqueOrThrow({ where: { id: C.id } });
    const linkAB = await prisma.taskDependency.findUnique({ where: { predecessorId_successorId: { predecessorId: A.id, successorId: bId } } });
    const linkBC = await prisma.taskDependency.findUnique({ where: { predecessorId_successorId: { predecessorId: bId, successorId: C.id } } });
    const oldLinkGone = await prisma.taskDependency.findUnique({ where: { id: oldLinkAC.id } });

    assert.equal(B.phaseId, phaseId, "La nueva sucesora debe compartir fase con A");
    assert.equal(iso(B.plannedStart), "2026-09-09", `B debía arrancar al terminar A (9), dio ${iso(B.plannedStart)}`);
    assert.ok(linkAB, "Debe existir el vínculo A->B");
    assert.ok(linkBC, "Debe existir el vínculo B->C (recableado)");
    assert.equal(oldLinkGone, null, "El vínculo directo A->C debe haberse cortado");
    assert.equal(iso(cAfter.plannedStart), "2026-09-10", `C debía correrse al terminar B (10), dio ${iso(cAfter.plannedStart)}`);

    // Caso 2 ("Crear predecesor" insertando EN MEDIO): D -> F ya existe.
    // Insertar E como predecesor de F debe cortar D->F y dejar D->E->F, y F
    // debe correrse al fin real de E.
    const D = await prisma.task.create({
      data: { projectId: project.id, phaseId, title: "D", plannedStart: new Date("2026-09-07"), plannedEnd: new Date("2026-09-08") },
    });
    const F = await prisma.task.create({
      data: { projectId: project.id, phaseId, title: "F", plannedStart: new Date("2026-09-09"), plannedEnd: new Date("2026-09-09") },
    });
    const oldLinkDF = await prisma.taskDependency.create({
      data: { predecessorId: D.id, successorId: F.id, type: "FINISH_TO_START" },
    });

    const eId = await insertAdjacentTaskCore(F.id, "predecessor", {
      ...baseData,
      title: "E",
      plannedStart: new Date("2026-09-07"),
      predecessorId: D.id,
    });
    const E = await prisma.task.findUniqueOrThrow({ where: { id: eId } });
    const fAfter = await prisma.task.findUniqueOrThrow({ where: { id: F.id } });
    const linkDE = await prisma.taskDependency.findUnique({ where: { predecessorId_successorId: { predecessorId: D.id, successorId: eId } } });
    const linkEF = await prisma.taskDependency.findUnique({ where: { predecessorId_successorId: { predecessorId: eId, successorId: F.id } } });
    const oldLinkDFGone = await prisma.taskDependency.findUnique({ where: { id: oldLinkDF.id } });

    assert.equal(E.phaseId, phaseId, "La nueva predecesora debe compartir fase con F");
    assert.equal(iso(E.plannedStart), "2026-09-09", `E debía arrancar al terminar D (9), dio ${iso(E.plannedStart)}`);
    assert.ok(linkDE, "Debe existir el vínculo D->E (recableado)");
    assert.ok(linkEF, "Debe existir el vínculo E->F");
    assert.equal(oldLinkDFGone, null, "El vínculo directo D->F debe haberse cortado");
    assert.equal(iso(fAfter.plannedStart), "2026-09-10", `F debía correrse al terminar E (10), dio ${iso(fAfter.plannedStart)}`);

    // Caso 3 ("Crear predecesor" simple, sin vínculo previo): G no tenía
    // predecesora. H se crea libre en la fecha elegida y G se corre a partir
    // de su fin real.
    const G = await prisma.task.create({
      data: { projectId: project.id, phaseId, title: "G", plannedStart: new Date("2026-09-07"), plannedEnd: new Date("2026-09-07") },
    });
    const hId = await insertAdjacentTaskCore(G.id, "predecessor", { ...baseData, title: "H", plannedStart: new Date("2026-09-14") });
    const gAfter = await prisma.task.findUniqueOrThrow({ where: { id: G.id } });
    const linkHG = await prisma.taskDependency.findUnique({ where: { predecessorId_successorId: { predecessorId: hId, successorId: G.id } } });

    assert.ok(linkHG, "Debe existir el vínculo H->G");
    assert.equal(iso(gAfter.plannedStart), "2026-09-15", `G debía correrse al terminar H (15), dio ${iso(gAfter.plannedStart)}`);

    console.log("OK: crear predecesor/sucesor comparte fase, se inserta en medio de un vínculo existente y empuja en cascada lo que sigue.");
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
