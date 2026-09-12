import { prisma } from "../src/lib/prisma";
import type { CheckResult } from "@prisma/client";

// Datos de PRUEBA (no reales) para ver cómo se ve/tabula el informe de
// Revisión (punto: informes de rendimiento individual estilo PSP) — crea
// rondas y checks reales sobre tareas QA ya existentes en los 2 proyectos
// de la base, con variedad de categorías, correcciones, revisores y
// devoluciones. Se puede correr más de una vez: borra sus propias rondas
// previas (marcadas con taskId en TASK_PLAN) antes de recrearlas.
// Para deshacer todo: borrar las ReviewRound de esos taskId (cascada borra
// los checks) y devolver esas tareas a su status original.

type CheckPlan = { category: string; result: CheckResult; responseCategory?: string };
type RoundPlan = { submittedBy: string; reviewedBy: string; daysAgo: number; checks: CheckPlan[] };
type TaskPlan = { taskId: string; rounds: RoundPlan[] };

const TASK_PLAN: TaskPlan[] = [
  {
    // Revisión de diseño — Ronda 1 (Racafé) — 3 rondas, se aprueba recién en la 3ra.
    taskId: "cmtr7c4f3003dxktf1b64dxjl",
    rounds: [
      {
        submittedBy: "David Hoyos",
        reviewedBy: "Elan",
        daysAgo: 20,
        checks: [
          { category: "Cumplimiento de requerimientos", result: "APPROVED" },
          {
            category: "Responsividad",
            result: "FAILED",
            responseCategory: "Corregido para que se adapte al ancho real del contenedor, no de la pantalla completa.",
          },
          {
            category: "Consistencia visual y de diseño",
            result: "FAILED",
            responseCategory: "Reemplazado el color suelto por el de la paleta del proyecto.",
          },
          { category: "Accesibilidad", result: "APPROVED" },
          { category: "Usabilidad", result: "FLAGGED" },
        ],
      },
      {
        submittedBy: "David Hoyos",
        reviewedBy: "Elan",
        daysAgo: 14,
        checks: [
          { category: "Responsividad", result: "APPROVED" },
          { category: "Consistencia visual y de diseño", result: "APPROVED" },
          { category: "Accesibilidad", result: "FAILED", responseCategory: "Agregado el foco, etiquetado o contraste faltante." },
          { category: "Usabilidad", result: "APPROVED" },
        ],
      },
      {
        submittedBy: "David Hoyos",
        reviewedBy: "Elan",
        daysAgo: 8,
        checks: [
          { category: "Accesibilidad", result: "APPROVED" },
          { category: "Cumplimiento de requerimientos", result: "APPROVED" },
          { category: "Consistencia visual y de diseño", result: "APPROVED" },
        ],
      },
    ],
  },
  {
    // QA continua — Sprint 1 (Racafé) — se devuelve una vez.
    taskId: "cmtr7c5w60046xktf3him1lqw",
    rounds: [
      {
        submittedBy: "Nata",
        reviewedBy: "Max",
        daysAgo: 18,
        checks: [
          {
            category: "Validaciones y datos inválidos",
            result: "FAILED",
            responseCategory: "Agregada la validación faltante con su mensaje de error.",
          },
          { category: "Cumplimiento de requerimientos", result: "APPROVED" },
          { category: "Errores de lógica y comportamiento inesperado", result: "APPROVED" },
          { category: "Rendimiento", result: "APPROVED" },
        ],
      },
      {
        submittedBy: "Nata",
        reviewedBy: "Max",
        daysAgo: 12,
        checks: [
          { category: "Validaciones y datos inválidos", result: "APPROVED" },
          { category: "Cumplimiento de requerimientos", result: "APPROVED" },
        ],
      },
    ],
  },
  {
    // QA continua — Sprint 2 (Racafé) — aprobada al primer intento.
    taskId: "cmtr7c69t004cxktfhtevah1u",
    rounds: [
      {
        submittedBy: "Nata",
        reviewedBy: "Elan",
        daysAgo: 10,
        checks: [
          { category: "Cumplimiento de requerimientos", result: "APPROVED" },
          { category: "Rendimiento", result: "APPROVED" },
          { category: "Usabilidad", result: "APPROVED" },
          { category: "Seguridad", result: "APPROVED" },
        ],
      },
    ],
  },
  {
    // Revisión bilingüe ES/EN (Racafé) — mismo error de idioma se repite 2 veces.
    taskId: "cmtr7c7a70051xktfqokgfqcr",
    rounds: [
      {
        submittedBy: "Nata",
        reviewedBy: "Max",
        daysAgo: 16,
        checks: [
          {
            category: "Lenguaje para el usuario final",
            result: "FAILED",
            responseCategory: "Reescrito el texto en lenguaje simple, sin jerga técnica.",
          },
          { category: "Usabilidad", result: "FAILED", responseCategory: "Simplificado el flujo o el texto para que sea más claro." },
          { category: "Cumplimiento de requerimientos", result: "APPROVED" },
          { category: "Consistencia visual y de diseño", result: "APPROVED" },
        ],
      },
      {
        submittedBy: "Nata",
        reviewedBy: "Max",
        daysAgo: 9,
        checks: [
          { category: "Lenguaje para el usuario final", result: "FAILED", responseCategory: "Corregido el trato a formal (usted)." },
          { category: "Usabilidad", result: "APPROVED" },
          { category: "Cumplimiento de requerimientos", result: "APPROVED" },
        ],
      },
      {
        submittedBy: "Nata",
        reviewedBy: "Max",
        daysAgo: 3,
        checks: [
          { category: "Lenguaje para el usuario final", result: "APPROVED" },
          { category: "Usabilidad", result: "APPROVED" },
        ],
      },
    ],
  },
  {
    // QA continua — Sprint 1 (Cafexport) — se devuelve una vez.
    taskId: "cmtstjf8x000d61tftaqg25ji",
    rounds: [
      {
        submittedBy: "Nata",
        reviewedBy: "David Hoyos",
        daysAgo: 15,
        checks: [
          {
            category: "Rendimiento",
            result: "FAILED",
            responseCategory: "Optimizada la consulta o el render que causaba la lentitud.",
          },
          { category: "Cumplimiento de requerimientos", result: "APPROVED" },
          { category: "Seguridad", result: "APPROVED" },
          { category: "Accesibilidad", result: "FLAGGED" },
        ],
      },
      {
        submittedBy: "Nata",
        reviewedBy: "David Hoyos",
        daysAgo: 7,
        checks: [
          { category: "Rendimiento", result: "APPROVED" },
          { category: "Cumplimiento de requerimientos", result: "APPROVED" },
        ],
      },
    ],
  },
  {
    // QA continua — Sprint 2 (Cafexport) — aprobada al primer intento.
    taskId: "cmtstjf9m000h61tfgw0hvyd6",
    rounds: [
      {
        submittedBy: "Nata",
        reviewedBy: "Elan",
        daysAgo: 5,
        checks: [
          { category: "Cumplimiento de requerimientos", result: "APPROVED" },
          { category: "Rendimiento", result: "APPROVED" },
          { category: "Validaciones y datos inválidos", result: "APPROVED" },
        ],
      },
    ],
  },
  {
    // HITO · Beta lista para pruebas (Cafexport) — se devuelve una vez.
    taskId: "cmtstjf9x000j61tf6cpw5w02",
    rounds: [
      {
        submittedBy: "David Hoyos",
        reviewedBy: "Nata",
        daysAgo: 11,
        checks: [
          {
            category: "Seguridad",
            result: "FAILED",
            responseCategory: "Agregada la verificación de permisos en el servidor.",
          },
          {
            category: "Convenciones de código y naming",
            result: "FAILED",
            responseCategory: "Renombrado siguiendo la convención ya usada en el proyecto.",
          },
          { category: "Cumplimiento de requerimientos", result: "APPROVED" },
          { category: "Rendimiento", result: "APPROVED" },
        ],
      },
      {
        submittedBy: "David Hoyos",
        reviewedBy: "Nata",
        daysAgo: 4,
        checks: [
          { category: "Seguridad", result: "APPROVED" },
          { category: "Convenciones de código y naming", result: "APPROVED" },
          { category: "Cumplimiento de requerimientos", result: "APPROVED" },
        ],
      },
    ],
  },
];

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const userIdByName = new Map(users.map((u) => [u.name, u.id]));

  const templateItems = await prisma.testTemplateItem.findMany({ orderBy: { order: "asc" } });
  const itemByCategory = new Map(templateItems.map((i) => [i.category, i]));

  const taskIds = TASK_PLAN.map((t) => t.taskId);
  await prisma.reviewRound.deleteMany({ where: { taskId: { in: taskIds } } });

  for (const taskPlan of TASK_PLAN) {
    for (const [i, round] of taskPlan.rounds.entries()) {
      const roundNumber = i + 1;
      const submittedById = userIdByName.get(round.submittedBy);
      const reviewedById = userIdByName.get(round.reviewedBy);
      if (!submittedById || !reviewedById) throw new Error(`Usuario no encontrado: ${round.submittedBy} / ${round.reviewedBy}`);

      const submittedAt = new Date(Date.now() - round.daysAgo * 86400000);
      const closedAt = new Date(submittedAt.getTime() + 2 * 86400000);
      const hasFailed = round.checks.some((c) => c.result === "FAILED");
      const outcome = hasFailed ? "RETURNED" : "APPROVED";

      await prisma.reviewRound.create({
        data: {
          taskId: taskPlan.taskId,
          roundNumber,
          submittedById,
          submittedAt,
          outcome,
          closedAt,
          deliverables: {
            create: [{ fileUrl: "https://example.com/entrega", fileName: `Entrega ronda ${roundNumber}`, mimeType: "text/x-link" }],
          },
          checks: {
            create: round.checks.map((c, order) => {
              const item = itemByCategory.get(c.category);
              return {
                title: item?.title ?? c.category,
                criteria: item?.criteria ?? null,
                category: c.category,
                result: c.result,
                // Texto libre que escribiría QUIEN ENTREGÓ describiendo su corrección —
                // a propósito NO repite el nombre de la categoría (así se ve real).
                responseCategory: c.result === "FAILED" ? c.responseCategory ?? null : null,
                reviewedById,
                order,
              };
            }),
          },
        },
      });
    }

    const lastOutcome = TASK_PLAN.find((t) => t.taskId === taskPlan.taskId)!.rounds.at(-1)!.checks.some((c) => c.result === "FAILED")
      ? "RETURNED"
      : "IN_PROGRESS";
    await prisma.task.update({ where: { id: taskPlan.taskId }, data: { status: lastOutcome } });
  }

  console.log(`Sembradas ${TASK_PLAN.reduce((n, t) => n + t.rounds.length, 0)} rondas en ${TASK_PLAN.length} tareas.`);
}

main().then(() => process.exit(0));
