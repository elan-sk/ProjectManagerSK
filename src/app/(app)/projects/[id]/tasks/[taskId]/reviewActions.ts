"use server";

import { revalidatePath } from "next/cache";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireProjectAdmin, canEditTask, canReviewTask } from "@/lib/permissions";
import { LINK_MIME_TYPE } from "@/lib/attachments";
import { notifyReturned, notifyReviewRequested } from "@/lib/notifications";
import type { CheckResult } from "@prisma/client";

async function revalidateTask(taskId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  revalidatePath(`/projects/${task.projectId}/tasks/${taskId}`);
}

// Punto 2.6: segundo grupo de personas de una tarea tipo Revisión — quién
// revisa, distinto de los asignados (que ejecutan). Solo PM/admin decide
// quién revisa, igual que ya pasa con la asignación de ejecutores.
export async function setTaskReviewers(taskId: string, formData: FormData) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  try {
    await requireProjectAdmin(task.projectId);
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
  const reviewerIds = formData.getAll("reviewerIds") as string[];
  await prisma.$transaction([
    prisma.taskReviewer.deleteMany({ where: { taskId } }),
    prisma.taskReviewer.createMany({ data: reviewerIds.map((userId) => ({ taskId, userId })) }),
  ]);
  await revalidateTask(taskId);
  return { ok: true as const };
}

// El ejecutor entrega lo que hizo -> nace una ronda nueva -> pasa a revisión.
// Si la tarea venía "Devuelta", reenviar la saca de ese estado.
export async function submitReviewRound(taskId: string, formData: FormData) {
  if (!(await canEditTask(taskId))) {
    return { ok: false as const, error: "No tenés permiso para editar esta tarea." };
  }
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "Sesión inválida." };

  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: { reviewRounds: true } });
  const url = formData.get("url");
  const name = formData.get("name");
  if (typeof url !== "string" || !url.trim() || typeof name !== "string" || !name.trim()) {
    return { ok: false as const, error: "Agregá al menos un link o archivo a entregar." };
  }
  const parsedUrl = z.string().trim().url().safeParse(url);
  if (!parsedUrl.success) {
    return { ok: false as const, error: "Ese link no parece válido — revisá que sea una dirección web completa (con https://)." };
  }

  const roundNumber = task.reviewRounds.length + 1;
  const round = await prisma.$transaction(async (tx) => {
    const created = await tx.reviewRound.create({
      data: {
        taskId,
        roundNumber,
        submittedById: session.user!.id,
        deliverables: { create: [{ fileUrl: parsedUrl.data, fileName: name.trim(), mimeType: LINK_MIME_TYPE }] },
      },
    });
    if (task.status === "RETURNED") {
      await tx.task.update({ where: { id: taskId }, data: { status: "IN_PROGRESS" } });
    }
    return created;
  });
  // Punto 10: si se eligió una plantilla desde la creación de la tarea, se
  // copia sola en la ronda 1 — el revisor no tiene que acordarse de aplicarla.
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
async function copyTemplateItemsToRound(reviewRoundId: string, templateId: string) {
  const template = await prisma.testTemplate.findUnique({
    where: { id: templateId },
    include: { items: { orderBy: { order: "asc" } } },
  });
  if (!template) return false;

  const count = await prisma.reviewCheck.count({ where: { reviewRoundId } });
  await prisma.reviewCheck.createMany({
    data: template.items.map((item, i) => ({
      reviewRoundId,
      title: item.title,
      criteria: item.criteria,
      category: item.category,
      order: count + i,
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

export async function addReviewCheck(reviewRoundId: string, formData: FormData) {
  if (!(await canReviewTask((await prisma.reviewRound.findUniqueOrThrow({ where: { id: reviewRoundId } })).taskId))) {
    return { ok: false as const, error: "No tenés permiso para revisar esta tarea." };
  }
  const parsed = z.string().trim().min(1).safeParse(formData.get("title"));
  if (!parsed.success) return { ok: false as const, error: "Describí la prueba." };
  const category = formData.get("category");
  const count = await prisma.reviewCheck.count({ where: { reviewRoundId } });
  const round = await prisma.reviewCheck.create({
    data: {
      reviewRoundId,
      title: parsed.data,
      category: typeof category === "string" && category.trim() ? category.trim() : null,
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

export async function setReviewCheckResult(checkId: string, result: CheckResult, note: string) {
  const check = await prisma.reviewCheck.findUniqueOrThrow({ where: { id: checkId }, include: { reviewRound: true } });
  if (!(await canReviewTask(check.reviewRound.taskId))) {
    return { ok: false as const, error: "No tenés permiso para revisar esta tarea." };
  }
  const session = await auth();
  await prisma.reviewCheck.update({
    where: { id: checkId },
    data: { result, note: note.trim() || null, reviewedById: session?.user?.id },
  });
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

export async function addReviewCheckEvidence(
  checkId: string,
  file: { url: string; name: string; mimeType: string }
) {
  const check = await prisma.reviewCheck.findUniqueOrThrow({ where: { id: checkId }, include: { reviewRound: true } });
  if (!(await canReviewTask(check.reviewRound.taskId))) {
    throw new Error("No tenés permiso para revisar esta tarea.");
  }
  await prisma.reviewCheckEvidence.create({
    data: { reviewCheckId: checkId, fileUrl: file.url, fileName: file.name, mimeType: file.mimeType },
  });
  await revalidateTask(check.reviewRound.taskId);
}

export async function removeReviewCheckEvidence(evidenceId: string) {
  const evidence = await prisma.reviewCheckEvidence.findUniqueOrThrow({
    where: { id: evidenceId },
    include: { reviewCheck: { include: { reviewRound: true } } },
  });
  await requireProjectAdmin((await prisma.task.findUniqueOrThrow({ where: { id: evidence.reviewCheck.reviewRound.taskId } })).projectId);
  await prisma.reviewCheckEvidence.delete({ where: { id: evidenceId } });
  if (evidence.mimeType !== LINK_MIME_TYPE) {
    await unlink(path.join(process.cwd(), "public", evidence.fileUrl)).catch(() => {});
  }
  await revalidateTask(evidence.reviewCheck.reviewRound.taskId);
}

// Cierra la ronda: exige que TODOS los checks tengan resultado. Si alguno
// quedó "Con errores" -> outcome=RETURNED y Task.status="RETURNED" (punto
// 2.6: se abre el ciclo de devolución). Si no -> outcome=APPROVED, la tarea
// vuelve a poder completarse por el flujo normal.
export async function closeReviewRound(reviewRoundId: string) {
  const round = await prisma.reviewRound.findUniqueOrThrow({
    where: { id: reviewRoundId },
    include: { checks: true },
  });
  if (!(await canReviewTask(round.taskId))) {
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
