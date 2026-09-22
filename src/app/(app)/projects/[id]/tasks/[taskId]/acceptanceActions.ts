"use server";

import { revalidatePath } from "next/cache";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canEditTask, type Actor } from "@/lib/permissions";
import { LINK_MIME_TYPE } from "@/lib/attachments";
import { notifyReturned } from "@/lib/notifications";

// Tarea tipo ACCEPTANCE: mismo motor de rondas que Prueba (QA) — ReviewRound/
// ReviewCheck — pero quien arma la lista de características es el equipo
// (canEditTask: asignado, PM o admin), no un TaskReviewer. Quien CALIFICA
// cada característica es el cliente externo sin cuenta, desde /share/[token]
// (ver src/app/share/shareActions.ts:setPublicAcceptanceDecision) — por eso
// acá no hay ningún "cerrar ronda" ni "calificar" manual: se autocierra sola
// cuando el cliente termina de decidir todas.

async function revalidateTask(taskId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  revalidatePath(`/projects/${task.projectId}/tasks/${taskId}`);
}

// El criterio viaja como HTML (editor WYSIWYG): un "<p></p>" vacío no debe guardarse como si hubiera contenido.
const isBlankHtml = (html: string) => html.replace(/<[^>]*>/g, "").trim().length === 0;

const deliverableInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1),
  url: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
});

// Igual que submitReviewRound (reviewActions.ts) pero sin plantilla por
// defecto (Aceptación no usa TestTemplate) y exigiendo solo evidencia de
// corrección al reenviar (no "categoría de respuesta" — eso es propio de QA).
export async function submitAcceptanceRound(
  taskId: string,
  deliverables: { id?: string; name: string; url: string; mimeType: string }[],
  actor?: Actor
) {
  if (!(await canEditTask(taskId, actor))) {
    return { ok: false as const, error: "No tenés permiso para editar esta tarea." };
  }
  const session = actor ?? (await auth())?.user;
  if (!session) return { ok: false as const, error: "Sesión inválida." };

  // Sin mínimo: los archivos/links son opcionales, lo que se acepta son las
  // características que se agregan después de crear la ronda.
  const parsed = z.array(deliverableInputSchema).safeParse(deliverables);
  if (!parsed.success) {
    return { ok: false as const, error: "No se pudo enviar: revisá los archivos o links agregados." };
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
    const returnedItems = lastRound.checks.filter((c) => c.result === "FAILED");
    const unanswered = returnedItems.filter((c) => c.evidence.length === 0);
    if (unanswered.length > 0) {
      return {
        ok: false as const,
        error: `Todavía hay ${unanswered.length} característica(s) devuelta(s) sin evidencia de corrección.`,
      };
    }
    carryForwardChecks = returnedItems;
  }

  const reusableDeliverableIds = new Set(lastRound?.deliverables.map((d) => d.id) ?? []);

  await prisma.$transaction(async (tx) => {
    const created = await tx.reviewRound.create({
      data: { taskId, roundNumber, submittedById: session.id },
    });
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
    for (const check of carryForwardChecks) {
      await tx.reviewCheck.update({
        where: { id: check.id },
        data: {
          reviewRoundId: created.id,
          result: null,
          externalReviewerName: null,
          externalReviewerRole: null,
          note: null,
        },
      });
    }
  });
  await revalidateTask(taskId);
  return { ok: true as const };
}

export async function addAcceptanceDeliverable(reviewRoundId: string, file: { url: string; name: string; mimeType: string }) {
  const round = await prisma.reviewRound.findUniqueOrThrow({ where: { id: reviewRoundId } });
  if (!(await canEditTask(round.taskId))) throw new Error("No tenés permiso para editar esta tarea.");
  await prisma.reviewDeliverable.create({
    data: { reviewRoundId, fileUrl: file.url, fileName: file.name, mimeType: file.mimeType },
  });
  await revalidateTask(round.taskId);
}

export async function addAcceptanceDeliverableLink(reviewRoundId: string, url: string, name: string) {
  const round = await prisma.reviewRound.findUniqueOrThrow({ where: { id: reviewRoundId } });
  if (!(await canEditTask(round.taskId))) throw new Error("No tenés permiso para editar esta tarea.");
  const parsedUrl = z.string().trim().url().safeParse(url);
  if (!parsedUrl.success) throw new Error("Ese link no parece válido — revisá que sea una dirección web completa (con https://).");
  const parsedName = z.string().trim().min(1).safeParse(name);
  if (!parsedName.success) throw new Error("Ponele un nombre al link.");
  await prisma.reviewDeliverable.create({
    data: { reviewRoundId, fileUrl: parsedUrl.data, fileName: parsedName.data, mimeType: LINK_MIME_TYPE },
  });
  await revalidateTask(round.taskId);
}

// "Prueba" en QA = "Característica/funcionalidad" acá — mismo modelo
// (ReviewCheck), mismo formulario (title + category + criteria).
export async function removeAcceptanceDeliverable(deliverableId: string) {
  const deliverable = await prisma.reviewDeliverable.findUnique({ where: { id: deliverableId }, include: { reviewRound: true } });
  if (!deliverable) return { ok: false as const, error: "Ese adjunto ya no existe." };
  if (!(await canEditTask(deliverable.reviewRound.taskId))) {
    return { ok: false as const, error: "No tenés permiso para editar esta tarea." };
  }
  if (deliverable.reviewRound.outcome !== null) {
    return { ok: false as const, error: "La ronda ya está cerrada, por lo que no se pueden quitar sus adjuntos." };
  }
  await prisma.reviewDeliverable.delete({ where: { id: deliverableId } });
  if (deliverable.mimeType !== LINK_MIME_TYPE) {
    await unlink(path.join(process.cwd(), "public", deliverable.fileUrl)).catch(() => {});
  }
  await revalidateTask(deliverable.reviewRound.taskId);
  return { ok: true as const };
}

export async function addAcceptanceItem(reviewRoundId: string, formData: FormData) {
  const round = await prisma.reviewRound.findUniqueOrThrow({ where: { id: reviewRoundId } });
  if (!(await canEditTask(round.taskId))) {
    return { ok: false as const, error: "No tenés permiso para editar esta tarea." };
  }
  const parsed = z.string().trim().min(1).safeParse(formData.get("title"));
  if (!parsed.success) return { ok: false as const, error: "Describí la característica o funcionalidad." };
  const category = formData.get("category");
  const criteria = formData.get("criteria");
  const count = await prisma.reviewCheck.count({ where: { reviewRoundId } });
  await prisma.reviewCheck.create({
    data: {
      reviewRoundId,
      title: parsed.data,
      category: typeof category === "string" && category.trim() ? category.trim() : null,
      criteria: typeof criteria === "string" && !isBlankHtml(criteria) ? criteria.trim() : null,
      order: count,
    },
  });
  await revalidateTask(round.taskId);
  return { ok: true as const };
}

export async function removeAcceptanceItem(checkId: string) {
  const check = await prisma.reviewCheck.findUniqueOrThrow({ where: { id: checkId }, include: { reviewRound: true } });
  if (!(await canEditTask(check.reviewRound.taskId))) {
    return { ok: false as const, error: "No tenés permiso para editar esta tarea." };
  }
  await prisma.reviewCheck.delete({ where: { id: checkId } });
  await revalidateTask(check.reviewRound.taskId);
  return { ok: true as const };
}

// Reescribe el texto de una característica (título, puntos a verificar, categoría) sin perder sus
// capturas ni sus comentarios. Solo mientras el cliente no la calificó y la ronda siga abierta.
const itemTextSchema = z.object({
  title: z.string().trim().min(1, "Falta indicar el título de la característica.").max(500, "El título es demasiado largo."),
  // Tope subido de 4000 a 20000: el criterio viaja como HTML del editor, que pesa más que texto plano.
  criteria: z.string().trim().max(20000, "La descripción es demasiado larga.").optional(),
  category: z.string().trim().max(120, "La categoría es demasiado larga.").optional(),
});

export async function updateAcceptanceItem(checkId: string, input: { title: string; criteria?: string; category?: string }) {
  const parsed = itemTextSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Los datos no son válidos." };
  const check = await prisma.reviewCheck.findUnique({ where: { id: checkId }, include: { reviewRound: true } });
  if (!check) return { ok: false as const, error: "Esa característica ya no existe." };
  if (!(await canEditTask(check.reviewRound.taskId))) {
    return { ok: false as const, error: "Solo un asignado a esta tarea, el PM del proyecto o un administrador pueden editarla." };
  }
  if (check.result !== null || check.reviewRound.outcome !== null) {
    return { ok: false as const, error: "Esta característica ya fue calificada o su ronda está cerrada, por lo que no se puede editar." };
  }
  const criteria = parsed.data.criteria && !isBlankHtml(parsed.data.criteria) ? parsed.data.criteria : null;
  await prisma.reviewCheck.update({
    where: { id: checkId },
    data: { title: parsed.data.title, criteria, category: parsed.data.category || null },
  });
  await revalidateTask(check.reviewRound.taskId);
  return { ok: true as const };
}

export async function addAcceptanceItemEvidence(checkId: string, file: { url: string; name: string; mimeType: string }) {
  const check = await prisma.reviewCheck.findUniqueOrThrow({ where: { id: checkId }, include: { reviewRound: true } });
  if (!(await canEditTask(check.reviewRound.taskId))) throw new Error("No tenés permiso para editar esta tarea.");
  await prisma.reviewCheckEvidence.create({
    data: { reviewCheckId: checkId, fileUrl: file.url, fileName: file.name, mimeType: file.mimeType },
  });
  await revalidateTask(check.reviewRound.taskId);
}

export async function addAcceptanceItemEvidenceLink(checkId: string, url: string, name: string) {
  const check = await prisma.reviewCheck.findUniqueOrThrow({ where: { id: checkId }, include: { reviewRound: true } });
  if (!(await canEditTask(check.reviewRound.taskId))) {
    return { ok: false as const, error: "No tenés permiso para editar esta tarea." };
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

export async function removeAcceptanceItemEvidence(evidenceId: string) {
  const evidence = await prisma.reviewCheckEvidence.findUniqueOrThrow({
    where: { id: evidenceId },
    include: { reviewCheck: { include: { reviewRound: true } } },
  });
  const taskId = evidence.reviewCheck.reviewRound.taskId;
  if (!(await canEditTask(taskId))) throw new Error("No tenés permiso para editar esta tarea.");
  await prisma.reviewCheckEvidence.delete({ where: { id: evidenceId } });
  if (evidence.mimeType !== LINK_MIME_TYPE) {
    await unlink(path.join(process.cwd(), "public", evidence.fileUrl)).catch(() => {});
  }
  await revalidateTask(taskId);
}

// Análogo a completeReviewTask (reviewActions.ts) pero con canEditTask: acá
// no hay revisor interno que finalice, lo hace quien ejecutó la tarea (o
// PM/admin) una vez que la última ronda quedó Aceptada por el cliente.
export async function completeAcceptanceTask(taskId: string, actor?: Actor) {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { reviewRounds: { orderBy: { roundNumber: "desc" }, take: 1 } },
  });
  if (!(await canEditTask(taskId, actor))) {
    return { ok: false as const, error: "No tenés permiso para completar esta tarea." };
  }
  const lastRound = task.reviewRounds[0];
  if (!lastRound || lastRound.outcome !== "APPROVED") {
    return { ok: false as const, error: "Esta entrega necesita una ronda aceptada por el cliente antes de poder completarse." };
  }
  await prisma.task.update({ where: { id: taskId }, data: { status: "COMPLETED", actualEnd: new Date() } });
  await revalidateTask(taskId);
  return { ok: true as const };
}

export async function addAcceptanceMessage(reviewRoundId: string, formData: FormData) {
  const round = await prisma.reviewRound.findUniqueOrThrow({ where: { id: reviewRoundId } });
  if (!(await canEditTask(round.taskId))) {
    return { ok: false as const, error: "No tenés permiso para comentar en esta ronda." };
  }
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "Sesión inválida." };

  const parsed = z.string().trim().min(1).safeParse(formData.get("body"));
  if (!parsed.success) return { ok: false as const, error: "Escribí un mensaje." };

  await prisma.reviewMessage.create({ data: { reviewRoundId, authorId: session.user.id, body: parsed.data } });
  await revalidateTask(round.taskId);
  return { ok: true as const };
}

export async function editAcceptanceMessage(messageId: string, body: string) {
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

// Reexportado para consistencia interna — nunca se llama desde acá (lo
// dispara setPublicAcceptanceDecision cuando el cliente devuelve algo), pero
// documenta que Aceptación reusa la misma notificación que QA.
export { notifyReturned as _notifyReturnedRef };
