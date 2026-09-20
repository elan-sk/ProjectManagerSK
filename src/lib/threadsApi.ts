import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Actor } from "@/lib/permissions";
import { fileMarker, imageMarker, linkMarker, mentionMarker, commentPlainText } from "@/lib/commentBody";
import { fileRefSchema, type Fail } from "@/lib/taskDesign";
import { POLL_INCLUDE, threadInclude, toTeamPoll, type PollRow } from "@/lib/threadView";
import { LINK_MIME_TYPE } from "@/lib/attachments";
import { mimeFromFileName } from "@/lib/uploadFile";
import { addTeamShareComment, addRoundMessage, addTeamProjectShareComment, voteSharePoll, setSharePollClosed } from "@/app/(app)/projects/[id]/tasks/[taskId]/shareThreadActions";
import { postInternalMessage } from "@/app/(app)/internalMessageActions";

// Comentarios, menciones, imágenes y preguntas de selección: publicar y leer en
// TODOS los lugares donde se comenta, con el usuario y el rol reales de quien
// llama (API o chat). Reutiliza las mismas acciones que la app web, así que las
// reglas (quién puede escribir, responder o cerrar una pregunta) son idénticas.

const fail = (status: number, error: string): Fail => ({ ok: false, status, error });

export const TASK_SCOPES = ["task", "adjustment_item", "acceptance_check", "qa_check", "round", "conversation"] as const;
export const PROJECT_SCOPES = ["project_conversation", "project_definition"] as const;

export const pollInputSchema = z.object({
  multiple: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(200)).min(2, "La pregunta necesita entre 2 y 10 opciones.").max(10, "La pregunta necesita entre 2 y 10 opciones."),
});

export const commentInputSchema = z.object({
  body: z.string().trim().min(1, "Falta el texto del comentario (o el enunciado de la pregunta).").max(3000),
  parentId: z.string().optional(),
  /** Ids de personas del equipo a @mencionar (solo en la conversación interna y el hilo de cada prueba). */
  mentions: z.array(z.string()).max(20).optional(),
  attachments: z.array(fileRefSchema).max(10).optional(),
  poll: pollInputSchema.optional(),
});
export type CommentInput = z.infer<typeof commentInputSchema>;

const asFile = (f: z.infer<typeof fileRefSchema>) => ({
  url: f.url,
  name: f.name,
  mimeType: f.mimeType ?? (/^https?:\/\//i.test(f.url) ? LINK_MIME_TYPE : mimeFromFileName(f.name || f.url)),
});

// La conversación interna guarda las menciones y los adjuntos como marcas dentro del texto
// (igual que la caja de la app): «@Nombre» se convierte en marca; las que no aparecen en el
// texto se agregan al final; imágenes, archivos y links se agregan como marcas.
async function internalText(input: CommentInput) {
  let text = input.body;
  const users = input.mentions?.length
    ? await prisma.user.findMany({ where: { id: { in: input.mentions }, active: true }, select: { id: true, name: true } })
    : [];
  for (const u of [...users].sort((a, b) => b.name.length - a.name.length)) {
    const at = `@${u.name}`;
    text = text.includes(at) ? text.split(at).join(mentionMarker(u.id, u.name)) : `${text} ${mentionMarker(u.id, u.name)}`;
  }
  for (const f of (input.attachments ?? []).map(asFile)) {
    text += ` ${f.mimeType === LINK_MIME_TYPE ? linkMarker(f.url, f.name) : f.mimeType.startsWith("image/") ? imageMarker(f.url) : fileMarker(f.url, f.name)}`;
  }
  return text;
}

type ActionResult = { ok: boolean; error?: string };
// Las acciones de la app devuelven { ok, error } sin código HTTP: 403 si es de permiso, si no 409 (regla de negocio).
const fromAction = (r: ActionResult, data: object = {}) =>
  r.ok ? { ok: true as const, ...data } : fail(/permiso|acceso|iniciar sesi/i.test(r.error ?? "") ? 403 : 409, r.error ?? "No se pudo completar la acción.");

async function safely(fn: () => Promise<ActionResult>) {
  try {
    return await fn();
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Publica un comentario o pregunta en un hilo de una tarea. `targetId` es el id del cambio, la característica, la prueba o la ronda, según el ámbito. */
export async function postTaskComment(taskId: string, actor: Actor, scope: (typeof TASK_SCOPES)[number], targetId: string | undefined, input: CommentInput) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, projectId: true, type: true } });
  if (!task) return fail(404, "La tarea no existe.");
  if (scope !== "task" && scope !== "conversation" && !targetId) return fail(400, "Falta targetId (el id del cambio, la característica, la prueba o la ronda).");

  if (scope === "task" || scope === "adjustment_item" || scope === "acceptance_check") {
    if (scope === "adjustment_item" && task.type !== "ADJUSTMENT") return fail(409, "Esta tarea no es de tipo Ajuste.");
    if (scope === "acceptance_check" && task.type !== "ACCEPTANCE") return fail(409, "Esta tarea no es de tipo Aceptación.");
    const r = await safely(() =>
      addTeamShareComment(
        taskId,
        {
          body: input.body,
          parentId: input.parentId,
          attachments: input.attachments?.map(asFile),
          poll: input.poll,
          adjustmentItemId: scope === "adjustment_item" ? targetId : undefined,
          reviewCheckId: scope === "acceptance_check" ? targetId : undefined,
        },
        actor
      )
    );
    return fromAction(r);
  }

  if (scope === "round") {
    const r = await safely(() => addRoundMessage(targetId!, { body: input.body, attachments: input.attachments?.map(asFile), poll: input.poll }, actor));
    return fromAction(r);
  }

  // qa_check y conversation: conversación interna (menciones, imágenes y archivos como marcas en el texto).
  if (scope === "qa_check" && task.type !== "QA") return fail(409, "Esta tarea no es de tipo Prueba.");
  const text = await internalText(input);
  const r = await safely(() => postInternalMessage(task.projectId, taskId, text, { reviewCheckId: scope === "qa_check" ? targetId : undefined, poll: input.poll }, actor));
  return fromAction(r);
}

/** Publica un comentario o pregunta en la conversación del proyecto o en el hilo de la Definición (el que ve el cliente por su link). */
export async function postProjectComment(projectId: string, actor: Actor, scope: (typeof PROJECT_SCOPES)[number], input: CommentInput) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return fail(404, "El proyecto no existe.");
  if (scope === "project_definition") {
    if (input.attachments?.length) return fail(400, "El hilo de la Definición no admite adjuntos.");
    return fromAction(await safely(() => addTeamProjectShareComment(projectId, { body: input.body, parentId: input.parentId, poll: input.poll }, actor)));
  }
  const text = await internalText(input);
  return fromAction(await safely(() => postInternalMessage(projectId, null, text, input.poll ? { poll: input.poll } : undefined, actor)));
}

// ---------- Preguntas ----------

export async function votePoll(pollId: string, optionIds: string[], actor: Actor) {
  return fromAction(await safely(() => voteSharePoll(pollId, optionIds, actor)));
}
export async function setPollClosed(pollId: string, closed: boolean, actor: Actor) {
  return fromAction(await safely(() => setSharePollClosed(pollId, closed, actor)));
}

function pollOut(poll: PollRow | null | undefined, userId: string) {
  if (!poll) return null;
  const p = toTeamPoll(poll, userId);
  return {
    id: p.id,
    multiple: p.multiple,
    closed: p.closed,
    respondents: p.totalVoters,
    myVoteIds: p.myVoteIds,
    // Porcentaje sobre las personas que respondieron: en selección múltiple puede sumar más de 100 %.
    options: p.options.map((o) => ({
      id: o.id,
      label: o.label,
      count: o.voters.length,
      percentOfRespondents: p.totalVoters > 0 ? Math.round((o.voters.length / p.totalVoters) * 100) : 0,
      voters: o.voters.map((v) => ({ name: v.name, role: v.role, team: v.fromTeam })),
    })),
  };
}

export async function getPoll(pollId: string, actor: Actor) {
  const poll = await prisma.sharePoll.findUnique({ where: { id: pollId }, include: POLL_INCLUDE.include });
  if (!poll) return fail(404, "La pregunta no existe.");
  return { ok: true as const, poll: pollOut(poll as unknown as PollRow, actor.id) };
}

// ---------- Lectura: todos los hilos de una tarea ----------

type ShareRow = {
  id: string;
  authorName: string;
  authorRole: string | null;
  authorUserId: string | null;
  body: string;
  createdAt: Date;
  attachments: { id: string; fileUrl: string; fileName: string; mimeType: string }[];
  poll?: PollRow | null;
  adjustmentItemId?: string | null;
  reviewCheckId?: string | null;
};

const shareOut = (c: ShareRow, userId: string) => ({
  id: c.id,
  author: { name: c.authorName, role: c.authorRole, team: c.authorUserId !== null },
  body: c.body,
  createdAt: c.createdAt.toISOString(),
  attachments: c.attachments.map((a) => ({ id: a.id, url: a.fileUrl, name: a.fileName, mimeType: a.mimeType })),
  poll: pollOut(c.poll, userId),
});

export async function listTaskThreads(taskId: string, actor: Actor) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, project: { select: { hidden: true } } } });
  if (!task || (task.project.hidden && actor.role !== "ADMIN")) return fail(404, "La tarea no existe.");

  const [shared, internal, roundMsgs] = await Promise.all([
    prisma.shareComment.findMany({ where: { taskId, parentId: null }, include: threadInclude, orderBy: { createdAt: "asc" } }),
    prisma.internalMessage.findMany({
      where: { taskId },
      include: { author: { select: { name: true } }, poll: POLL_INCLUDE, mentions: { include: { user: { select: { name: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.reviewMessage.findMany({
      where: { reviewRound: { taskId } },
      include: { author: { select: { name: true } }, attachments: true, poll: POLL_INCLUDE },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const group = <T,>(rows: T[], key: (r: T) => string | null | undefined) => {
    const out: Record<string, T[]> = {};
    for (const r of rows) {
      const k = key(r);
      if (k) (out[k] ??= []).push(r);
    }
    return out;
  };
  const share = (c: (typeof shared)[number]) => ({ ...shareOut(c as unknown as ShareRow, actor.id), replies: c.replies.map((r) => shareOut(r as unknown as ShareRow, actor.id)) });
  const internalOut = (m: (typeof internal)[number]) => ({
    id: m.id,
    author: m.author.name,
    text: commentPlainText(m.body),
    mentions: m.mentions.map((x) => ({ userId: x.userId, name: x.user.name })),
    createdAt: m.createdAt.toISOString(),
    poll: pollOut(m.poll as unknown as PollRow | null, actor.id),
  });
  const byMap = <T, U>(g: Record<string, T[]>, f: (t: T) => U) => Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.map(f)]));

  return {
    ok: true as const,
    taskId,
    /** Comentarios de la tarea que ve también el cliente por su link. */
    general: shared.filter((c) => !c.adjustmentItemId && !c.reviewCheckId).map(share),
    /** Hilo de cada cambio de un Ajuste (por id del cambio). */
    adjustmentItems: byMap(group(shared, (c) => c.adjustmentItemId), share),
    /** Hilo de cada característica de una Aceptación (por id de la característica). */
    acceptanceChecks: byMap(group(shared, (c) => c.reviewCheckId), share),
    /** Hilo interno de cada prueba de una Prueba/QA (por id de la prueba). */
    qaChecks: byMap(group(internal, (m) => m.reviewCheckId), internalOut),
    /** Conversación interna de la tarea. */
    conversation: internal.filter((m) => !m.reviewCheckId).map(internalOut),
    /** Hilo interno de cada ronda (por id de la ronda). */
    rounds: byMap(group(roundMsgs, (m) => m.reviewRoundId), (m) => ({
      id: m.id,
      author: m.author.name,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      attachments: m.attachments.map((a) => ({ id: a.id, url: a.fileUrl, name: a.fileName, mimeType: a.mimeType })),
      poll: pollOut(m.poll as unknown as PollRow | null, actor.id),
    })),
  };
}
