import "dotenv/config";
import { prisma } from "../src/lib/prisma";

// Segundo proyecto de ejemplo (a pedido del usuario) para poder ver varios
// proyectos a la vez en el panorama general de /projects — fechas elegidas
// a propósito para solapar con tareas reales de "Reconversión racafe.com.co"
// en Max/Elan/Nata, así también se ve la colisión de agenda funcionando.
async function main() {
  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true } });
  const byName = (name: string) => users.find((u) => u.name === name)!;
  const elan = byName("Elan");
  const max = byName("Max");
  const nata = byName("Nata");
  const david = byName("David Hoyos");

  const existing = await prisma.project.findFirst({ where: { name: "App móvil Cafexport" } });
  if (existing) {
    console.log("Ya existe 'App móvil Cafexport' — no se duplica.");
    return;
  }

  const project = await prisma.project.create({
    data: {
      name: "App móvil Cafexport",
      clientName: "Cafexport",
      countryCode: "CO",
      status: "ACTIVE",
      startDate: new Date("2026-08-25T00:00:00.000Z"),
      pmId: nata.id,
      phases: {
        create: [
          { name: "Descubrimiento", order: 0 },
          { name: "Diseño", order: 1 },
          { name: "Desarrollo", order: 2 },
        ],
      },
    },
    include: { phases: true },
  });
  const phaseId = (name: string) => project.phases.find((p) => p.name === name)!.id;

  const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  const t1 = await prisma.task.create({
    data: {
      projectId: project.id,
      phaseId: phaseId("Descubrimiento"),
      title: "Investigación de usuarios y benchmark",
      type: "SIMPLE",
      status: "COMPLETED",
      plannedStart: d("2026-08-25"),
      plannedEnd: d("2026-08-28"),
      actualStart: d("2026-08-25"),
      actualEnd: d("2026-08-28"),
      assignees: { create: [{ userId: elan.id }] },
    },
  });

  const t2 = await prisma.task.create({
    data: {
      projectId: project.id,
      phaseId: phaseId("Descubrimiento"),
      title: "Definición de alcance y wireframes",
      type: "SIMPLE",
      status: "IN_PROGRESS",
      plannedStart: d("2026-08-29"),
      plannedEnd: d("2026-09-04"),
      actualStart: d("2026-08-29"),
      assignees: { create: [{ userId: nata.id }, { userId: david.id }] },
    },
  });

  const t3 = await prisma.task.create({
    data: {
      projectId: project.id,
      phaseId: phaseId("Diseño"),
      title: "Diseño UI móvil (Figma)",
      type: "SIMPLE", // checklist ahora es transversal (ver steps)
      status: "NOT_STARTED",
      plannedStart: d("2026-09-07"),
      plannedEnd: d("2026-09-15"),
      assignees: { create: [{ userId: david.id }] },
      steps: {
        create: [
          { description: "Pantallas de catálogo y ficha de producto", done: false, order: 0 },
          { description: "Flujo de checkout y pago", done: false, order: 1 },
        ],
      },
    },
  });

  const t4 = await prisma.task.create({
    data: {
      projectId: project.id,
      phaseId: phaseId("Diseño"),
      title: "Validación de diseño con cliente",
      type: "SIMPLE", // reunión ahora es un atributo (meetingUrl), no un tipo
      status: "NOT_STARTED",
      plannedStart: d("2026-09-16"),
      plannedEnd: d("2026-09-17"),
      assignees: { create: [{ userId: nata.id }] },
    },
  });

  const t5 = await prisma.task.create({
    data: {
      projectId: project.id,
      phaseId: phaseId("Desarrollo"),
      title: "Setup del proyecto (Expo / React Native)",
      type: "SIMPLE",
      status: "NOT_STARTED",
      plannedStart: d("2026-09-18"),
      plannedEnd: d("2026-09-22"),
      assignees: { create: [{ userId: max.id }] },
    },
  });

  // Se solapa con "Sprint 1 — Desarrollo: Home" de Racafé (21-25 sept, Max y Elan).
  const t6 = await prisma.task.create({
    data: {
      projectId: project.id,
      phaseId: phaseId("Desarrollo"),
      title: "Sprint 1 — Catálogo y ficha de producto",
      type: "SIMPLE",
      riskLevel: "MEDIUM",
      status: "NOT_STARTED",
      plannedStart: d("2026-09-23"),
      plannedEnd: d("2026-09-30"),
      assignees: { create: [{ userId: max.id }, { userId: elan.id }] },
    },
  });
  await prisma.taskDependency.create({ data: { predecessorId: t5.id, successorId: t6.id, type: "FINISH_TO_START" } });

  // Se solapa con "QA continua — Sprint 1" de Racafé (21-25 sept, Nata).
  const t7 = await prisma.task.create({
    data: {
      projectId: project.id,
      phaseId: phaseId("Desarrollo"),
      title: "QA continua — Sprint 1",
      type: "QA",
      status: "NOT_STARTED",
      plannedStart: d("2026-09-23"),
      plannedEnd: d("2026-09-30"),
      assignees: { create: [{ userId: nata.id }] },
    },
  });
  await prisma.taskDependency.create({ data: { predecessorId: t6.id, successorId: t7.id, type: "START_TO_START" } });

  // Se solapa con "Sprint 2" de Racafé (28 sept-7 oct, Max y Elan) — además
  // riesgo alto para que salga como cuello de botella (bloquea 2 tareas).
  const t8 = await prisma.task.create({
    data: {
      projectId: project.id,
      phaseId: phaseId("Desarrollo"),
      title: "Sprint 2 — Checkout y pagos",
      type: "SIMPLE",
      riskLevel: "HIGH",
      status: "NOT_STARTED",
      plannedStart: d("2026-10-01"),
      plannedEnd: d("2026-10-12"),
      assignees: { create: [{ userId: max.id }, { userId: elan.id }] },
    },
  });
  await prisma.taskDependency.create({ data: { predecessorId: t6.id, successorId: t8.id, type: "FINISH_TO_START" } });

  const t9 = await prisma.task.create({
    data: {
      projectId: project.id,
      phaseId: phaseId("Desarrollo"),
      title: "QA continua — Sprint 2",
      type: "QA",
      status: "NOT_STARTED",
      plannedStart: d("2026-10-01"),
      plannedEnd: d("2026-10-12"),
      assignees: { create: [{ userId: nata.id }] },
    },
  });
  await prisma.taskDependency.create({ data: { predecessorId: t8.id, successorId: t9.id, type: "START_TO_START" } });

  const t10 = await prisma.task.create({
    data: {
      projectId: project.id,
      phaseId: phaseId("Desarrollo"),
      title: "HITO · Beta lista para pruebas",
      type: "MILESTONE",
      status: "NOT_STARTED",
      plannedStart: d("2026-10-13"),
      plannedEnd: d("2026-10-13"),
      assignees: { create: [{ userId: david.id }] },
    },
  });
  await prisma.taskDependency.create({ data: { predecessorId: t8.id, successorId: t10.id, type: "FINISH_TO_START" } });
  await prisma.taskDependency.create({ data: { predecessorId: t9.id, successorId: t10.id, type: "FINISH_TO_START" } });

  console.log(`Creado "${project.name}" (PM: ${nata.name}) con 10 tareas en 3 fases.`);
  console.log("Ids de referencia:", { t1: t1.id, t2: t2.id, t3: t3.id, t4: t4.id, t5: t5.id, t6: t6.id, t7: t7.id, t8: t8.id, t9: t9.id, t10: t10.id });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
