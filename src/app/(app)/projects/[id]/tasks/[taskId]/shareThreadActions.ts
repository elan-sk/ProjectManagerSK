"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canEditTask, canReviewTask, canParticipateInProject, getActingUser, getProjectAdmin, type Actor } from "@/lib/permissions";

// La sesión del navegador o, si viene, el usuario de la API (con su rol real).
async function getSession(actor?: Actor) {
  const user = await getActingUser(actor);
  return user ? { user } : null;
}

const fileSchema = z.object({ url: z.string().min(1), name: z.string().min(1), mimeType: z.string().min(1) });

// Respuesta del equipo (asignado, PM o admin) en el hilo de comentarios del
// link compartido de una tarea o de un cambio de Ajuste. Cuelga del mismo
// ShareComment que los del cliente, así el externo la ve en su hilo; las
// imágenes adjuntas quedan como INSUMO de la tarea (igual que las del cliente).
export async function addTeamShareComment(
  taskId: string,
  data: {
    body: string;
    adjustmentItemId?: string;
    /** Tarea de Aceptación: el comentario cuelga de una característica de la ronda. */
    reviewCheckId?: string;
    parentId?: string;
    attachments?: { url: string; name: string; mimeType: string }[];
    /** Si viene, el comentario es una pregunta: el body es el enunciado. */
    poll?: { multiple: boolean; options: string[] };
  },
  actor?: Actor
) {
  const session = await getSession(actor);
  if (!session?.user || !(await canEditTask(taskId, actor))) {
    return { ok: false as const, error: "No se cuenta con permiso para responder en esta tarea." };
  }
  const body = data.body.trim();
  const files = z.array(fileSchema).max(10).safeParse(data.attachments ?? []);
  if (!files.success || (!body && files.data.length === 0)) return { ok: false as const, error: "Falta escribir un comentario o adjuntar una imagen." };

  let pollOptions: string[] | null = null;
  if (data.poll) {
    pollOptions = data.poll.options.map((o) => o.trim()).filter(Boolean);
    if (!body) return { ok: false as const, error: "Falta escribir el enunciado de la pregunta." };
    if (pollOptions.length < 2 || pollOptions.length > 10) return { ok: false as const, error: "La pregunta necesita entre 2 y 10 opciones." };
    if (new Set(pollOptions.map((o) => o.toLowerCase())).size !== pollOptions.length) return { ok: false as const, error: "Hay opciones repetidas." };
    if (data.parentId) return { ok: false as const, error: "Una pregunta no puede ser una respuesta." };
  }

  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { projectId: true, status: true } });
  if (files.data.length > 0 && task.status === "COMPLETED") {
    return { ok: false as const, error: "La tarea ya está completada — no se pueden subir más archivos." };
  }
  if (data.adjustmentItemId) {
    const item = await prisma.adjustmentItem.findUnique({ where: { id: data.adjustmentItemId }, select: { taskId: true } });
    if (!item || item.taskId !== taskId) return { ok: false as const, error: "Ese cambio no pertenece a esta tarea." };
  }
  if (data.reviewCheckId) {
    const check = await prisma.reviewCheck.findUnique({ where: { id: data.reviewCheckId }, select: { reviewRound: { select: { taskId: true } } } });
    if (!check || check.reviewRound.taskId !== taskId) return { ok: false as const, error: "Esa característica no pertenece a esta tarea." };
  }
  if (data.parentId) {
    const parent = await prisma.shareComment.findUnique({ where: { id: data.parentId }, select: { taskId: true, parentId: true } });
    if (!parent || parent.taskId !== taskId) return { ok: false as const, error: "Ese comentario ya no existe." };
  }

  await prisma.$transaction(async (tx) => {
    const comment = await tx.shareComment.create({
      data: {
        taskId,
        adjustmentItemId: data.adjustmentItemId ?? null,
        reviewCheckId: data.reviewCheckId ?? null,
        parentId: data.parentId ?? null,
        authorName: session.user.name ?? "Equipo",
        authorRole: "Equipo",
        authorUserId: session.user.id,
        body,
        ...(pollOptions && data.poll
          ? { poll: { create: { multiple: data.poll.multiple, options: { create: pollOptions.map((label, order) => ({ label, order })) } } } }
          : {}),
      },
    });
    if (files.data.length > 0) {
      await tx.attachment.createMany({
        data: files.data.map((f) => ({
          taskId,
          kind: "INSUMO" as const,
          fileUrl: f.url,
          fileName: f.name,
          mimeType: f.mimeType,
          uploadedById: session.user.id,
          shareCommentId: comment.id,
        })),
      });
    }
  });

  revalidatePath(`/projects/${task.projectId}/tasks/${taskId}`);
  return { ok: true as const };
}

// Vuelve a abrir un cambio de Ajuste para que el cliente lo califique otra vez.
// Solo lo hace el equipo (asignado, PM o admin): el cliente nunca cambia por su
// cuenta una calificación ya enviada.
export async function reopenAdjustmentReview(itemId: string, actor?: Actor) {
  const item = await prisma.adjustmentItem.findUnique({ where: { id: itemId }, select: { taskId: true, task: { select: { projectId: true, status: true } } } });
  if (!item) return { ok: false as const, error: "Ese cambio ya no existe." };
  if (!(await canEditTask(item.taskId, actor))) return { ok: false as const, error: "No se cuenta con permiso para habilitar una nueva revisión." };
  if (item.task.status === "COMPLETED") return { ok: false as const, error: "La tarea ya está completada." };

  await prisma.adjustmentItem.update({ where: { id: itemId }, data: { clientReviewOpen: true } });
  revalidatePath(`/projects/${item.task.projectId}/tasks/${item.taskId}`);
  return { ok: true as const };
}

// Quien puede responder una pregunta desde adentro de la app: quien tiene
// permisos sobre la tarea (asignados, revisores, PM y admin).
async function canAnswerTask(taskId: string, actor?: Actor) {
  return (await canEditTask(taskId, actor)) || (await canReviewTask(taskId, actor));
}

// Una pregunta cuelga de un comentario del hilo compartido (de una tarea o de la
// Definición del proyecto), de un mensaje de una conversación interna (del
// proyecto, de la tarea o de una prueba) o de un mensaje del hilo interno de una
// ronda; en todos los casos se resuelve el proyecto y, si la hay, la tarea.
async function loadPoll(pollId: string) {
  const poll = await prisma.sharePoll.findUnique({
    where: { id: pollId },
    select: {
      id: true,
      multiple: true,
      closed: true,
      options: { select: { id: true } },
      comment: { select: { taskId: true, projectId: true, authorUserId: true, task: { select: { projectId: true } } } },
      reviewMessage: { select: { authorId: true, reviewRound: { select: { taskId: true, task: { select: { projectId: true } } } } } },
      internalMessage: { select: { taskId: true, projectId: true, authorId: true } },
    },
  });
  if (!poll) return null;
  const taskId = poll.comment?.taskId ?? poll.reviewMessage?.reviewRound.taskId ?? poll.internalMessage?.taskId ?? null;
  const projectId =
    poll.comment?.task?.projectId ?? poll.comment?.projectId ?? poll.reviewMessage?.reviewRound.task.projectId ?? poll.internalMessage?.projectId ?? null;
  if (!projectId) return null;
  const authorId = poll.comment?.authorUserId ?? poll.reviewMessage?.authorId ?? poll.internalMessage?.authorId ?? null;
  return { id: poll.id, multiple: poll.multiple, closed: poll.closed, options: poll.options, taskId, projectId, authorId };
}

// Responder: con tarea, quien tiene permisos sobre ella; sin tarea (conversación
// del proyecto o Definición), quien participa en el proyecto.
async function canAnswerPoll(poll: { taskId: string | null; projectId: string }, actor?: Actor) {
  return poll.taskId ? canAnswerTask(poll.taskId, actor) : canParticipateInProject(poll.projectId, null, actor);
}

const pollPath = (poll: { taskId: string | null; projectId: string }) =>
  poll.taskId ? `/projects/${poll.projectId}/tasks/${poll.taskId}` : `/projects/${poll.projectId}`;

export async function voteSharePoll(pollId: string, optionIds: string[], actor?: Actor) {
  const session = await getSession(actor);
  const poll = await loadPoll(pollId);
  if (!session?.user || !poll) return { ok: false as const, error: "Esa pregunta ya no existe." };
  if (!(await canAnswerPoll(poll, actor))) return { ok: false as const, error: "No se cuenta con permiso para responder esta pregunta." };
  if (poll.closed) return { ok: false as const, error: "La pregunta ya está cerrada." };

  const valid = new Set(poll.options.map((o) => o.id));
  const chosen = [...new Set(optionIds)].filter((id) => valid.has(id));
  if (chosen.length === 0) return { ok: false as const, error: "Falta elegir una opción." };
  if (!poll.multiple && chosen.length > 1) return { ok: false as const, error: "Esta pregunta admite una sola opción." };

  const voterKey = `u:${session.user.id}`;
  await prisma.$transaction([
    prisma.sharePollVote.deleteMany({ where: { pollId, voterKey } }),
    prisma.sharePollVote.createMany({ data: chosen.map((optionId) => ({ pollId, optionId, voterKey, userId: session.user.id })) }),
  ]);
  revalidatePath(pollPath(poll));
  return { ok: true as const };
}

// Cerrar (o volver a abrir) una pregunta: quien la publicó, quien edita la tarea
// o el PM/admin del proyecto.
export async function setSharePollClosed(pollId: string, closed: boolean, actor?: Actor) {
  const session = await getSession(actor);
  const poll = await loadPoll(pollId);
  if (!session?.user || !poll) return { ok: false as const, error: "Esa pregunta ya no existe." };
  const allowed =
    poll.authorId === session.user.id || (poll.taskId ? await canEditTask(poll.taskId, actor) : Boolean(await getProjectAdmin(poll.projectId, actor)));
  if (!allowed) return { ok: false as const, error: "No se cuenta con permiso para cerrar esta pregunta." };
  await prisma.sharePoll.update({ where: { id: pollId }, data: { closed } });
  revalidatePath(pollPath(poll));
  return { ok: true as const };
}

// Mensaje del hilo interno de una ronda (Prueba o Aceptación): texto, imágenes
// y/o una pregunta de selección. Solo lo ve el equipo. Prueba lo escribe quien
// edita o revisa la tarea; Aceptación, quien la edita.
export async function addRoundMessage(
  reviewRoundId: string,
  data: { body: string; attachments?: { url: string; name: string; mimeType: string }[]; poll?: { multiple: boolean; options: string[] } },
  actor?: Actor
) {
  const session = await getSession(actor);
  const round = await prisma.reviewRound.findUnique({ where: { id: reviewRoundId }, select: { taskId: true, task: { select: { type: true, projectId: true } } } });
  if (!session?.user || !round) return { ok: false as const, error: "Esa ronda ya no existe." };
  const allowed = round.task.type === "QA" ? await canAnswerTask(round.taskId, actor) : await canEditTask(round.taskId, actor);
  if (!allowed) return { ok: false as const, error: "No se cuenta con permiso para escribir en este hilo." };

  const body = data.body.trim();
  const files = z.array(fileSchema).max(10).safeParse(data.attachments ?? []);
  if (!files.success || (!body && files.data.length === 0)) return { ok: false as const, error: "Falta escribir un mensaje o adjuntar una imagen." };

  let pollOptions: string[] | null = null;
  if (data.poll) {
    pollOptions = data.poll.options.map((o) => o.trim()).filter(Boolean);
    if (!body) return { ok: false as const, error: "Falta escribir el enunciado de la pregunta." };
    if (pollOptions.length < 2 || pollOptions.length > 10) return { ok: false as const, error: "La pregunta necesita entre 2 y 10 opciones." };
    if (new Set(pollOptions.map((o) => o.toLowerCase())).size !== pollOptions.length) return { ok: false as const, error: "Hay opciones repetidas." };
  }

  await prisma.reviewMessage.create({
    data: {
      reviewRoundId,
      authorId: session.user.id,
      body,
      ...(files.data.length > 0 ? { attachments: { create: files.data.map((f) => ({ fileUrl: f.url, fileName: f.name, mimeType: f.mimeType })) } } : {}),
      ...(pollOptions && data.poll
        ? { poll: { create: { multiple: data.poll.multiple, options: { create: pollOptions.map((label, order) => ({ label, order })) } } } }
        : {}),
    },
  });
  revalidatePath(`/projects/${round.task.projectId}/tasks/${round.taskId}`);
  return { ok: true as const };
}

// Comentario del equipo en el hilo compartido de la Definición de un proyecto:
// lo ve el cliente en su link (con la etiqueta «Equipo»). Puede ser una pregunta
// de selección; no admite adjuntos (no hay tarea a cuyos Insumos sumarlos).
export async function addTeamProjectShareComment(
  projectId: string,
  data: { body: string; parentId?: string; poll?: { multiple: boolean; options: string[] } },
  actor?: Actor
) {
  const session = await getSession(actor);
  if (!session?.user || !(await canParticipateInProject(projectId, null, actor))) {
    return { ok: false as const, error: "No se cuenta con permiso para comentar en este proyecto." };
  }
  const body = data.body.trim();
  if (!body) return { ok: false as const, error: "Falta escribir el comentario." };

  let pollOptions: string[] | null = null;
  if (data.poll) {
    if (data.parentId) return { ok: false as const, error: "Una pregunta no puede ser una respuesta." };
    pollOptions = data.poll.options.map((o) => o.trim()).filter(Boolean);
    if (pollOptions.length < 2 || pollOptions.length > 10) return { ok: false as const, error: "La pregunta necesita entre 2 y 10 opciones." };
    if (new Set(pollOptions.map((o) => o.toLowerCase())).size !== pollOptions.length) return { ok: false as const, error: "Hay opciones repetidas." };
  }
  if (data.parentId) {
    const parent = await prisma.shareComment.findUnique({ where: { id: data.parentId }, select: { projectId: true } });
    if (!parent || parent.projectId !== projectId) return { ok: false as const, error: "Ese comentario ya no existe." };
  }

  await prisma.shareComment.create({
    data: {
      projectId,
      parentId: data.parentId ?? null,
      authorName: session.user.name ?? "Equipo",
      authorRole: "Equipo",
      authorUserId: session.user.id,
      body,
      ...(pollOptions && data.poll
        ? { poll: { create: { multiple: data.poll.multiple, options: { create: pollOptions.map((label, order) => ({ label, order })) } } } }
        : {}),
    },
  });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true as const };
}
