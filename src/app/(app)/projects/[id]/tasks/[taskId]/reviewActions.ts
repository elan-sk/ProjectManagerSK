"use server";

import { revalidatePath } from "next/cache";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getProjectAdmin, canEditTask, canReviewTask, type Actor } from "@/lib/permissions";
import { LINK_MIME_TYPE } from "@/lib/attachments";
import { notifyReturned, notifyReviewRequested } from "@/lib/notifications";
import type { CheckResult } from "@prisma/client";

async function revalidateTask(taskId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  revalidatePath(`/projects/${task.projectId}/tasks/${taskId}`);
}

// Punto 2.6: segundo grupo de personas de una tarea tipo Revisión — quién
// revisa, distinto de los asignados (que ejecutan).
// Punto 11: si la tarea todavía no tiene revisor, el propio asignado puede
// elegir uno UNA sola vez (nunca a sí mismo) — después de eso, cambiar de
// revisor queda reservado a PM, admin, o el revisor actual (para poder
// pasarle la posta a otro revisor).
export async function setTaskReviewers(taskId: string, formData: FormData, actor?: Actor) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: { reviewers: true, assignees: true } });
  const session = actor ?? (await auth())?.user;
  if (!session) return { ok: false as const, error: "Sesión inválida." };

  // Una vez completada, el revisor queda fijo — nadie (ni PM ni admin) puede
  // cambiarlo, ni siquiera el propio revisor.
  if (task.status === "COMPLETED") {
    return { ok: false as const, error: "Esta tarea ya está completada — no se puede cambiar el revisor." };
  }

  const reviewerIds = formData.getAll("reviewerIds") as string[];
  const currentReviewerIds = task.reviewers.map((r) => r.userId);
  const isAdminOrPm = Boolean(await getProjectAdmin(task.projectId, actor));
  const isCurrentReviewer = currentReviewerIds.includes(session.id);

  // Regla dura, sin excepción de rol (ni PM ni admin): un asignado a la
  // tarea no puede ser también su revisor — se pierde el sentido de la
  // revisión si alguien se corrige a sí mismo.
  const assigneeIds = task.assignees.map((a) => a.userId);
  if (reviewerIds.some((id) => assigneeIds.includes(id))) {
    return { ok: false as const, error: "Un asignado a la tarea no puede ser también su revisor." };
  }

  if (!isAdminOrPm && !isCurrentReviewer) {
    if (currentReviewerIds.length > 0) {
      return { ok: false as const, error: "Solo el PM, un administrador o el revisor actual pueden cambiar el revisor." };
    }
    if (!(await canEditTask(taskId, actor))) {
      return { ok: false as const, error: "No tenés permiso para asignar un revisor a esta tarea." };
    }
    if (reviewerIds.length === 0) {
      return { ok: false as const, error: "Elegí un revisor." };
    }
  }

  await prisma.$transaction([
    prisma.taskReviewer.deleteMany({ where: { taskId } }),
    prisma.taskReviewer.createMany({ data: reviewerIds.map((userId) => ({ taskId, userId })) }),
  ]);
  await revalidateTask(taskId);
  return { ok: true as const };
}

const deliverableInputSchema = z.object({
  // Presente cuando el ítem viene de la ronda anterior (reenvío) — reasigna
  // esa MISMA fila a la ronda nueva en vez de duplicarla (ver
  // submitReviewRound). Ausente para un ítem cargado recién en esta ronda.
  id: z.string().optional(),
  name: z.string().trim().min(1),
  url: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
});

// El ejecutor entrega lo que hizo -> nace una ronda nueva -> pasa a revisión.
// Si la tarea venía "Devuelta", reenviar la saca de ese estado.
// Punto 7: se puede entregar cualquier combinación de links y archivos, no
// uno solo de un solo tipo — `deliverables` ya viene armado del cliente
// (cada ítem subido/agregado antes de tocar "Enviar").
// Punto 8: al REENVIAR (roundNumber > 1) después de una devolución, la
// ronda nueva no nace vacía ni copia la plantilla entera de nuevo — solo
// arrastra las pruebas que habían quedado "Con errores" (misma prueba, otra
// ronda), y exige que el asignado ya les haya puesto respuesta + evidencia
// de corrección antes de poder reenviar.
export async function submitReviewRound(
  taskId: string,
  deliverables: { id?: string; name: string; url: string; mimeType: string }[],
  actor?: Actor
) {
  if (!(await canEditTask(taskId, actor))) {
    return { ok: false as const, error: "No tenés permiso para editar esta tarea." };
  }
  const session = actor ?? (await auth())?.user;
  if (!session) return { ok: false as const, error: "Sesión inválida." };

  const parsed = z.array(deliverableInputSchema).min(1).safeParse(deliverables);
  if (!parsed.success) {
    return { ok: false as const, error: "Agregá al menos un link o archivo a entregar." };
  }
  for (const d of parsed.data) {
    if (d.mimeType === LINK_MIME_TYPE && !z.string().trim().url().safeParse(d.url).success) {
      return { ok: false as const, error: `Ese link no parece válido — revisá "${d.name}" (con https://).` };
    }
  }

  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: {
      reviewRounds: {
        orderBy: { roundNumber: "desc" },
        include: { deliverables: true, checks: { include: { evidence: true } } },
      },
    },
  });

  const roundNumber = task.reviewRounds.length + 1;
  const lastRound = task.reviewRounds[0] ?? null;
  let carryForwardChecks: (typeof task.reviewRounds)[number]["checks"] = [];

  if (roundNumber > 1) {
    if (!lastRound || lastRound.outcome !== "RETURNED") {
      return { ok: false as const, error: "No hay ninguna ronda devuelta para reenviar." };
    }
    const failedChecks = lastRound.checks.filter((c) => c.result === "FAILED");
    const unanswered = failedChecks.filter((c) => !c.responseCategory?.trim() || c.evidence.length === 0);
    if (unanswered.length > 0) {
      return {
        ok: false as const,
        error: `Todavía hay ${unanswered.length} prueba(s) con error sin respuesta o sin evidencia de corrección.`,
      };
    }
    carryForwardChecks = failedChecks;
  }

  // Un `id` de entregable solo es válido si pertenece a la última ronda de
  // ESTA tarea — evita que alguien reasigne (secuestre) un entregable de otra
  // tarea/ronda pasándolo por acá.
  const reusableDeliverableIds = new Set(lastRound?.deliverables.map((d) => d.id) ?? []);

  const round = await prisma.$transaction(async (tx) => {
    const created = await tx.reviewRound.create({
      data: { taskId, roundNumber, submittedById: session.id },
    });
    // Punto 3b: reenviar no duplica el entregable — si ya existía (viene de
    // la ronda anterior, el asignado solo lo dejó igual o lo editó), se
    // REASIGNA esa misma fila a la ronda nueva; solo se crea una fila cuando
    // es un ítem realmente nuevo.
    for (const d of parsed.data) {
      if (d.id && reusableDeliverableIds.has(d.id)) {
        await tx.reviewDeliverable.update({
          where: { id: d.id },
          data: { reviewRoundId: created.id, fileUrl: d.url, fileName: d.name, mimeType: d.mimeType },
        });
      } else {
        await tx.reviewDeliverable.create({
          data: { reviewRoundId: created.id, fileUrl: d.url, fileName: d.name, mimeType: d.mimeType },
        });
      }
    }
    if (task.status === "RETURNED") {
      await tx.task.update({ where: { id: taskId }, data: { status: "IN_PROGRESS" } });
    }
    // Punto 3b/4 (confirmado con el usuario): "es la misma prueba" también a
    // nivel de fila — se REASIGNA el mismo ReviewCheck a la ronda nueva (no
    // se recrea), así su evidencia (ligada al id de la prueba, no a la
    // ronda) queda intacta sin ninguna duplicación. El resultado nace en
    // blanco para que el revisor la vuelva a mirar.
    for (const check of carryForwardChecks) {
      await tx.reviewCheck.update({
        where: { id: check.id },
        data: { reviewRoundId: created.id, result: null, reviewedById: null },
      });
    }
    return created;
  });
  // Punto 10 (plantilla por defecto): si se eligió una plantilla desde la
  // creación de la tarea, se copia sola en la ronda 1 — el revisor no tiene
  // que acordarse de aplicarla.
  if (roundNumber === 1 && task.defaultTestTemplateId) {
    await copyTemplateItemsToRound(round.id, task.defaultTestTemplateId);
  }
  await notifyReviewRequested(taskId);
  await revalidateTask(taskId);
  return { ok: true as const };
}

export async function addReviewDeliverable(
  reviewRoundId: string,
  file: { url: string; name: string; mimeType: string }
) {
  const round = await prisma.reviewRound.findUniqueOrThrow({ where: { id: reviewRoundId } });
  if (!(await canEditTask(round.taskId))) {
    throw new Error("No tenés permiso para editar esta tarea.");
  }
  await prisma.reviewDeliverable.create({
    data: { reviewRoundId, fileUrl: file.url, fileName: file.name, mimeType: file.mimeType },
  });
  await revalidateTask(round.taskId);
}

export async function addReviewDeliverableLink(reviewRoundId: string, url: string, name: string) {
  const round = await prisma.reviewRound.findUniqueOrThrow({ where: { id: reviewRoundId } });
  if (!(await canEditTask(round.taskId))) {
    throw new Error("No tenés permiso para editar esta tarea.");
  }
  const parsedUrl = z.string().trim().url().safeParse(url);
  if (!parsedUrl.success) throw new Error("Ese link no parece válido — revisá que sea una dirección web completa (con https://).");
  const parsedName = z.string().trim().min(1).safeParse(name);
  if (!parsedName.success) throw new Error("Ponele un nombre al link.");
  await prisma.reviewDeliverable.create({
    data: { reviewRoundId, fileUrl: parsedUrl.data, fileName: parsedName.data, mimeType: LINK_MIME_TYPE },
  });
  await revalidateTask(round.taskId);
}

// Copia los ítems de una plantilla como checks EDITABLES de esta ronda —
// tocar/quitar acá nunca modifica la plantilla de origen. Compartido entre
// applyTestTemplate (el revisor la aplica a mano) y submitReviewRound (se
// aplica sola si la tarea ya traía una plantilla por defecto desde su
// creación, punto 10).
// Punto 13: IDEMPOTENTE por sourceTemplateItemId — reaplicar la misma
// plantilla nunca duplica un punto que ya está en la ronda, y esa es
// justamente la forma de "recuperar" uno que el revisor había quitado sin
// querer: basta con volver a elegir la plantilla del desplegable.
async function copyTemplateItemsToRound(reviewRoundId: string, templateId: string) {
  const template = await prisma.testTemplate.findUnique({
    where: { id: templateId },
    include: { items: { orderBy: { order: "asc" } } },
  });
  if (!template) return false;

  const existing = await prisma.reviewCheck.findMany({
    where: { reviewRoundId, sourceTemplateItemId: { not: null } },
    select: { sourceTemplateItemId: true },
  });
  const existingIds = new Set(existing.map((c) => c.sourceTemplateItemId));
  const missing = template.items.filter((item) => !existingIds.has(item.id));
  if (missing.length === 0) return true;

  const count = await prisma.reviewCheck.count({ where: { reviewRoundId } });
  await prisma.reviewCheck.createMany({
    data: missing.map((item, i) => ({
      reviewRoundId,
      title: item.title,
      criteria: item.criteria,
      category: item.category,
      order: count + i,
      sourceTemplateItemId: item.id,
    })),
  });
  return true;
}

export async function applyTestTemplate(reviewRoundId: string, templateId: string) {
  const round = await prisma.reviewRound.findUniqueOrThrow({ where: { id: reviewRoundId } });
  if (!(await canReviewTask(round.taskId))) {
    return { ok: false as const, error: "No tenés permiso para revisar esta tarea." };
  }
  const applied = await copyTemplateItemsToRound(reviewRoundId, templateId);
  if (!applied) return { ok: false as const, error: "Plantilla no encontrada." };
  await revalidateTask(round.taskId);
  return { ok: true as const };
}

// Punto 13: ahora también acepta `criteria` (los puntos específicos de la
// prueba, uno por línea) — antes solo se podía poner título y categoría, sin
// forma de agregar el detalle que sí trae una prueba tomada de una plantilla.
export async function addReviewCheck(reviewRoundId: string, formData: FormData) {
  if (!(await canReviewTask((await prisma.reviewRound.findUniqueOrThrow({ where: { id: reviewRoundId } })).taskId))) {
    return { ok: false as const, error: "No tenés permiso para revisar esta tarea." };
  }
  const parsed = z.string().trim().min(1).safeParse(formData.get("title"));
  if (!parsed.success) return { ok: false as const, error: "Describí la prueba." };
  const category = formData.get("category");
  const criteria = formData.get("criteria");
  const count = await prisma.reviewCheck.count({ where: { reviewRoundId } });
  const round = await prisma.reviewCheck.create({
    data: {
      reviewRoundId,
      title: parsed.data,
      category: typeof category === "string" && category.trim() ? category.trim() : null,
      criteria: typeof criteria === "string" && criteria.trim() ? criteria.trim() : null,
      order: count,
    },
    include: { reviewRound: true },
  });
  await revalidateTask(round.reviewRound.taskId);
  return { ok: true as const };
}

export async function removeReviewCheck(checkId: string) {
  const check = await prisma.reviewCheck.findUniqueOrThrow({ where: { id: checkId }, include: { reviewRound: true } });
  if (!(await canReviewTask(check.reviewRound.taskId))) {
    return { ok: false as const, error: "No tenés permiso para revisar esta tarea." };
  }
  await prisma.reviewCheck.delete({ where: { id: checkId } });
  await revalidateTask(check.reviewRound.taskId);
  return { ok: true as const };
}

// Punto 6: calificar "Con errores" o "Con hallazgos" exige evidencia ya
// cargada en la prueba — "Aprobada"/"No aplica" no la necesitan.
export async function setReviewCheckResult(checkId: string, result: CheckResult, note: string, actor?: Actor) {
  const check = await prisma.reviewCheck.findUniqueOrThrow({
    where: { id: checkId },
    include: { reviewRound: true, evidence: true },
  });
  if (!(await canReviewTask(check.reviewRound.taskId, actor))) {
    return { ok: false as const, error: "No tenés permiso para revisar esta tarea." };
  }
  if ((result === "FAILED" || result === "FLAGGED") && check.evidence.length === 0) {
    return { ok: false as const, error: "Para calificar con error o con hallazgo, primero subí evidencia." };
  }
  const reviewedById = actor?.id ?? (await auth())?.user?.id;
  await prisma.reviewCheck.update({
    where: { id: checkId },
    data: { result, note: note.trim() || null, reviewedById },
  });
  await revalidateTask(check.reviewRound.taskId);
  return { ok: true as const };
}

// Punto 4: el revisor puede revertir su propia calificación (volverla a
// dejar sin resultado) mientras la ronda siga abierta — una vez cerrada
// (outcome ya definido), queda fija.
export async function revertReviewCheckResult(checkId: string, actor?: Actor) {
  const check = await prisma.reviewCheck.findUniqueOrThrow({ where: { id: checkId }, include: { reviewRound: true } });
  if (!(await canReviewTask(check.reviewRound.taskId, actor))) {
    return { ok: false as const, error: "No tenés permiso para revisar esta tarea." };
  }
  if (check.reviewRound.outcome !== null) {
    return { ok: false as const, error: "Esta ronda ya está cerrada — no se puede revertir la calificación." };
  }
  await prisma.reviewCheck.update({ where: { id: checkId }, data: { result: null, reviewedById: null } });
  await revalidateTask(check.reviewRound.taskId);
  return { ok: true as const };
}

export async function setCheckResponseCategory(checkId: string, category: string) {
  const check = await prisma.reviewCheck.findUniqueOrThrow({ where: { id: checkId }, include: { reviewRound: true } });
  if (!(await canEditTask(check.reviewRound.taskId))) {
    return { ok: false as const, error: "No tenés permiso para editar esta tarea." };
  }
  await prisma.reviewCheck.update({ where: { id: checkId }, data: { responseCategory: category.trim() || null } });
  await revalidateTask(check.reviewRound.taskId);
  return { ok: true as const };
}

// Punto 8: la evidencia de una corrección la sube quien corrige (el
// asignado, canEditTask) sobre una prueba que YA quedó "Con errores" — antes
// esto era exclusivo del revisor (tenía sentido para evidencia de por qué
// falló, pero no dejaba lugar a la evidencia de la corrección).
export async function addReviewCheckEvidence(
  checkId: string,
  file: { url: string; name: string; mimeType: string }
) {
  const check = await prisma.reviewCheck.findUniqueOrThrow({ where: { id: checkId }, include: { reviewRound: true } });
  const [canReview, canEdit] = await Promise.all([
    canReviewTask(check.reviewRound.taskId),
    canEditTask(check.reviewRound.taskId),
  ]);
  const canCorrect = canEdit && check.result === "FAILED";
  if (!canReview && !canCorrect) {
    throw new Error("No tenés permiso para agregar evidencia acá.");
  }
  await prisma.reviewCheckEvidence.create({
    data: { reviewCheckId: checkId, fileUrl: file.url, fileName: file.name, mimeType: file.mimeType },
  });
  await revalidateTask(check.reviewRound.taskId);
}

// Punto 3a: la evidencia de corrección admite link además de archivo — misma
// validación/permiso que addReviewCheckEvidence, comparte el mismo criterio
// que addReviewDeliverableLink para el link.
export async function addReviewCheckEvidenceLink(checkId: string, url: string, name: string) {
  const check = await prisma.reviewCheck.findUniqueOrThrow({ where: { id: checkId }, include: { reviewRound: true } });
  const [canReview, canEdit] = await Promise.all([
    canReviewTask(check.reviewRound.taskId),
    canEditTask(check.reviewRound.taskId),
  ]);
  const canCorrect = canEdit && check.result === "FAILED";
  if (!canReview && !canCorrect) {
    return { ok: false as const, error: "No tenés permiso para agregar evidencia acá." };
  }
  const parsedUrl = z.string().trim().url().safeParse(url);
  if (!parsedUrl.success) return { ok: false as const, error: "Ese link no parece válido — revisá que sea una dirección web completa (con https://)." };
  const parsedName = z.string().trim().min(1).safeParse(name);
  if (!parsedName.success) return { ok: false as const, error: "Ponele un nombre al link." };
  await prisma.reviewCheckEvidence.create({
    data: { reviewCheckId: checkId, fileUrl: parsedUrl.data, fileName: parsedName.data, mimeType: LINK_MIME_TYPE },
  });
  await revalidateTask(check.reviewRound.taskId);
  return { ok: true as const };
}

export async function removeReviewCheckEvidence(evidenceId: string) {
  const evidence = await prisma.reviewCheckEvidence.findUniqueOrThrow({
    where: { id: evidenceId },
    include: { reviewCheck: { include: { reviewRound: true } } },
  });
  const taskId = evidence.reviewCheck.reviewRound.taskId;
  const [canReview, canEdit] = await Promise.all([canReviewTask(taskId), canEditTask(taskId)]);
  const canCorrect = canEdit && evidence.reviewCheck.result === "FAILED";
  if (!canReview && !canCorrect) {
    throw new Error("No tenés permiso para quitar esta evidencia.");
  }
  await prisma.reviewCheckEvidence.delete({ where: { id: evidenceId } });
  if (evidence.mimeType !== LINK_MIME_TYPE) {
    await unlink(path.join(process.cwd(), "public", evidence.fileUrl)).catch(() => {});
  }
  await revalidateTask(taskId);
}

// Cierra la ronda: exige que TODOS los checks tengan resultado. Si alguno
// quedó "Con errores" -> outcome=RETURNED y Task.status="RETURNED" (punto
// 2.6: se abre el ciclo de devolución). Si no -> outcome=APPROVED, la tarea
// vuelve a poder completarse por el flujo normal (punto 15: con el botón
// dedicado del panel, no desde el control de estado genérico).
export async function closeReviewRound(reviewRoundId: string, actor?: Actor) {
  const round = await prisma.reviewRound.findUniqueOrThrow({
    where: { id: reviewRoundId },
    include: { checks: true },
  });
  if (!(await canReviewTask(round.taskId, actor))) {
    return { ok: false as const, error: "No tenés permiso para revisar esta tarea." };
  }
  if (round.checks.length === 0) {
    return { ok: false as const, error: "Agregá al menos una prueba antes de cerrar la ronda." };
  }
  if (round.checks.some((c) => !c.result)) {
    return { ok: false as const, error: "Todavía hay pruebas sin resultado." };
  }

  const hasFailed = round.checks.some((c) => c.result === "FAILED");
  const outcome = hasFailed ? "RETURNED" : "APPROVED";

  await prisma.$transaction(async (tx) => {
    await tx.reviewRound.update({ where: { id: reviewRoundId }, data: { outcome, closedAt: new Date() } });
    if (hasFailed) {
      await tx.task.update({ where: { id: round.taskId }, data: { status: "RETURNED" } });
    }
  });
  if (hasFailed) await notifyReturned(round.taskId);
  await revalidateTask(round.taskId);
  return { ok: true as const };
}

// Punto 15: solo el revisor (o PM/admin, ya incluidos en canReviewTask)
// puede finalizar una Prueba, y solo cuando la última ronda quedó aprobada
// — reusa exactamente la misma condición que ya valida updateTaskStatus del
// lado servidor (actions.ts), esto es nada más el botón dedicado del panel.
export async function completeReviewTask(taskId: string, actor?: Actor) {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { reviewRounds: { orderBy: { roundNumber: "desc" }, take: 1 } },
  });
  if (!(await canReviewTask(taskId, actor))) {
    return { ok: false as const, error: "Solo el revisor, el PM del proyecto o un administrador pueden completar esta prueba." };
  }
  const lastRound = task.reviewRounds[0];
  if (!lastRound || lastRound.outcome !== "APPROVED") {
    return { ok: false as const, error: "Esta revisión necesita una ronda aprobada antes de poder completarse." };
  }
  await prisma.task.update({ where: { id: taskId }, data: { status: "COMPLETED", actualEnd: new Date() } });
  await revalidateTask(taskId);
  return { ok: true as const };
}

export async function addReviewMessage(reviewRoundId: string, formData: FormData) {
  const round = await prisma.reviewRound.findUniqueOrThrow({ where: { id: reviewRoundId } });
  const [canEdit, canReview] = await Promise.all([canEditTask(round.taskId), canReviewTask(round.taskId)]);
  if (!canEdit && !canReview) {
    return { ok: false as const, error: "No tenés permiso para comentar en esta revisión." };
  }
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "Sesión inválida." };

  const parsed = z.string().trim().min(1).safeParse(formData.get("body"));
  if (!parsed.success) return { ok: false as const, error: "Escribí un mensaje." };

  await prisma.reviewMessage.create({ data: { reviewRoundId, authorId: session.user.id, body: parsed.data } });
  await revalidateTask(round.taskId);
  return { ok: true as const };
}

// Editable, no borrable (decisión ya confirmada) — solo el propio autor.
export async function editReviewMessage(messageId: string, body: string) {
  const message = await prisma.reviewMessage.findUniqueOrThrow({ where: { id: messageId }, include: { reviewRound: true } });
  const session = await auth();
  if (session?.user?.id !== message.authorId) {
    return { ok: false as const, error: "Solo quien escribió el mensaje puede editarlo." };
  }
  const parsed = z.string().trim().min(1).safeParse(body);
  if (!parsed.success) return { ok: false as const, error: "El mensaje no puede quedar vacío." };

  await prisma.reviewMessage.update({ where: { id: messageId }, data: { body: parsed.data, editedAt: new Date() } });
  await revalidateTask(message.reviewRound.taskId);
  return { ok: true as const };
}
