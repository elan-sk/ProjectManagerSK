import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { getAgendaCounts, getPmProjectsSummary } from "../src/lib/agendaSummary";
import { getTaskAlert, matchesRiskFilter } from "../src/lib/delays";
import { isStartingSoon } from "../src/lib/statusColors";
import { isFirstWorkingHour, localDateKey } from "../src/lib/workingHours";

// Chequeo del dashboard de Agenda + resumen diario de WhatsApp: tracking de
// "tarea vista" (TaskAssignee.viewedAt), conteos de getAgendaCounts, resumen
// de proyectos de un PM, y el corte de "primera hora laboral" del digest.
async function main() {
  const pm = await prisma.user.create({
    data: {
      name: "__verify_pm__",
      username: `__verify_pm_${Date.now()}__`,
      passwordHash: await bcrypt.hash("x", 4),
    },
  });

  const project = await prisma.project.create({
    data: {
      name: "__verify-agenda-digest__",
      startDate: new Date(),
      pmId: pm.id,
      phases: { create: [{ name: "F1", order: 0 }] },
    },
    include: { phases: true },
  });
  const phaseId = project.phases[0].id;

  try {
    const now = new Date();
    const daysFromNow = (n: number) => new Date(now.getTime() + n * 86_400_000);

    const overdueTask = await prisma.task.create({
      data: {
        projectId: project.id,
        phaseId,
        title: "Vencida",
        plannedStart: daysFromNow(-20),
        plannedEnd: daysFromNow(-10),
        status: "IN_PROGRESS", // explícito: si quedara NOT_STARTED (default) también contaría ahí, y acá se quiere aislar el conteo "overdue".
      },
    });
    // Inicio retrasado: plannedStart ya pasó, sigue NOT_STARTED (default), y
    // plannedEnd todavía no llega — si plannedEnd también hubiera pasado ya
    // sería "overdue" en vez de "lateStart" (ver getTaskAlert).
    const lateStartTask = await prisma.task.create({
      data: { projectId: project.id, phaseId, title: "Inicio retrasado", plannedStart: daysFromNow(-5), plannedEnd: daysFromNow(10) },
    });
    const blockedTask = await prisma.task.create({
      data: {
        projectId: project.id,
        phaseId,
        title: "Bloqueada",
        plannedStart: daysFromNow(-5),
        plannedEnd: daysFromNow(5),
        status: "BLOCKED",
      },
    });
    // Empieza pronto: NOT_STARTED, plannedStart todavía no llega pero está
    // cerca (preventivo — distinto de lateStart, que ya pasó).
    const startingSoonTask = await prisma.task.create({
      data: { projectId: project.id, phaseId, title: "Empieza pronto", plannedStart: daysFromNow(1), plannedEnd: daysFromNow(30) },
    });
    const unopenedTask = await prisma.task.create({
      data: {
        projectId: project.id,
        phaseId,
        title: "Nueva asignación",
        plannedStart: daysFromNow(1),
        plannedEnd: daysFromNow(2),
        status: "IN_PROGRESS",
      },
    });

    await prisma.taskAssignee.createMany({
      data: [overdueTask, lateStartTask, blockedTask, unopenedTask].map((t) => ({ taskId: t.id, userId: pm.id })),
    });

    const countsBefore = await getAgendaCounts(pm.id);
    assert.equal(countsBefore.overdue, 1, `overdue esperado 1, dio ${countsBefore.overdue}`);
    assert.equal(countsBefore.lateStart, 1, `lateStart esperado 1, dio ${countsBefore.lateStart}`);
    assert.equal(countsBefore.blocked, 1, `blocked esperado 1, dio ${countsBefore.blocked}`);
    assert.equal(countsBefore.unopened, 4, `unopened esperado 4 (nada visto todavía), dio ${countsBefore.unopened}`);

    // Simula abrir el detalle de una tarea (mismo update que hace tasks/[taskId]/page.tsx).
    await prisma.taskAssignee.updateMany({
      where: { taskId: unopenedTask.id, userId: pm.id, viewedAt: null },
      data: { viewedAt: new Date() },
    });
    const countsAfter = await getAgendaCounts(pm.id);
    assert.equal(countsAfter.unopened, 3, `unopened tras abrir una tarea esperado 3, dio ${countsAfter.unopened}`);

    const pmSummary = await getPmProjectsSummary(pm.id);
    const thisProject = pmSummary.find((p) => p.id === project.id);
    assert.ok(thisProject, "getPmProjectsSummary no devolvió el proyecto de prueba");
    assert.equal(thisProject!.total, 5, `total esperado 5, dio ${thisProject!.total}`);
    assert.equal(thisProject!.lateStartCount, 1, `lateStartCount del proyecto esperado 1, dio ${thisProject!.lateStartCount}`);
    assert.equal(thisProject!.overdueCount, 1, `overdueCount del proyecto esperado 1, dio ${thisProject!.overdueCount}`);
    assert.equal(thisProject!.blockedCount, 1, `blockedCount del proyecto esperado 1, dio ${thisProject!.blockedCount}`);
    assert.equal(thisProject!.startingSoonCount, 1, `startingSoonCount del proyecto esperado 1, dio ${thisProject!.startingSoonCount}`);
    assert.equal(thisProject!.health, "bad", `health esperado "bad" (1/5 vencidas = 20%), dio "${thisProject!.health}"`);

    // isStartingSoon/matchesRiskFilter con fixtures fijos (sin depender de la
    // fecha real de hoy, para no ser frágil cerca de un fin de semana).
    assert.equal(isStartingSoon({ daysUntilStart: 2 }), true, "2 días hábiles debía contar como \"empieza pronto\"");
    assert.equal(isStartingSoon({ daysUntilStart: 3 }), false, "3 días hábiles NO debía contar como \"empieza pronto\"");
    assert.equal(isStartingSoon({ daysUntilStart: null }), false, "null (ya arrancó o no aplica) no debía contar");
    assert.equal(
      matchesRiskFilter({ level: "onTrack", daysUntilStart: 1 }, "startingSoon"),
      true,
      "matchesRiskFilter(startingSoon) debía usar daysUntilStart, no level"
    );
    assert.equal(
      matchesRiskFilter({ level: "overdue", daysUntilStart: null }, "overdue"),
      true,
      "matchesRiskFilter con un risk normal debía comparar contra level"
    );

    // La propia tarea "Empieza pronto" recién creada, vía getTaskAlert real.
    const soonAlert = await getTaskAlert(project.countryCode, startingSoonTask);
    assert.ok(soonAlert.daysUntilStart !== null, "la tarea con plannedStart mañana debía traer daysUntilStart no nulo");

    // Corte de "primera hora laboral" (miércoles sin festivo cerca, para no
    // depender de la Ley Emiliani corriendo algún feriado de lunes).
    assert.equal(localDateKey(new Date("2026-03-11T13:00:00Z")), "2026-03-11", "localDateKey no arma bien la clave YYYY-MM-DD");
    const opening = new Date("2026-03-11T13:00:00Z"); // 8am Bogotá (UTC-5)
    assert.equal(await isFirstWorkingHour(opening, "CO", 8, 18), true, "8am Bogotá debía ser la primera hora laboral");
    assert.equal(
      await isFirstWorkingHour(new Date("2026-03-11T15:00:00Z"), "CO", 8, 18),
      false,
      "10am Bogotá no debía ser la primera hora laboral"
    );

    console.log("OK: conteos de agenda, tracking de vista, resumen de PM y corte de primera hora laboral funcionan como se espera.");
  } finally {
    // ponytail: Task.phaseId no tiene onDelete:Cascade en el schema (bug
    // preexistente, no de esta feature — confirmado que también rompe
    // verify-late-start-alert.ts sin tocar) — hay que borrar las tareas antes
    // que el proyecto o MySQL rechaza el delete por la FK de Phase.
    await prisma.task.deleteMany({ where: { projectId: project.id } });
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.user.delete({ where: { id: pm.id } });
  }
}

main()
  .catch((err) => {
    console.error("FALLÓ:", err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
