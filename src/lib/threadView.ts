import type { TeamPoll, TeamThreadComment } from "@/app/(app)/projects/[id]/tasks/[taskId]/TeamShareThread";

// Datos que comparten todas las pantallas internas con comentarios del link
// compartido y preguntas de selección (tarea, ajuste, característica, definición
// del proyecto, conversaciones internas). Solo salen a la vista interna: la
// estadística (quién votó qué) nunca llega al link público.

/** Include de Prisma para traer una pregunta con sus opciones y votos (con el nombre de quien votó). */
export const POLL_INCLUDE = {
  include: {
    options: {
      orderBy: { order: "asc" as const },
      include: { votes: { include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" as const } } },
    },
  },
};

export type PollRow = {
  id: string;
  multiple: boolean;
  closed: boolean;
  options: {
    id: string;
    label: string;
    votes: { voterKey: string; userId: string | null; externalName: string | null; externalRole: string | null; user: { name: string } | null }[];
  }[];
};

export type ShareCommentRow = {
  id: string;
  authorName: string;
  authorRole: string | null;
  authorUserId: string | null;
  body: string;
  createdAt: Date;
  attachments: { id: string; fileUrl: string; fileName: string; mimeType: string }[];
  poll?: PollRow | null;
};

// Pregunta del equipo -> DTO con la estadística (cuántos y quién respondió qué). Solo sale a la vista interna.
export function toTeamPoll(poll: PollRow, userId: string | null): TeamPoll {
  const voters = new Set(poll.options.flatMap((o) => o.votes.map((v) => v.voterKey)));
  return {
    id: poll.id,
    multiple: poll.multiple,
    closed: poll.closed,
    totalVoters: voters.size,
    myVoteIds: poll.options.filter((o) => o.votes.some((v) => userId && v.userId === userId)).map((o) => o.id),
    options: poll.options.map((o) => ({
      id: o.id,
      label: o.label,
      voters: o.votes.map((v) => ({ name: v.user?.name ?? v.externalName ?? "Sin nombre", role: v.externalRole, fromTeam: v.userId !== null })),
    })),
  };
}

// Comentarios del link compartido (cliente y equipo) -> DTO serializable para el hilo interno.
export function toThreadComment(c: ShareCommentRow, userId: string | null): Omit<TeamThreadComment, "replies"> {
  return {
    id: c.id,
    authorName: c.authorName,
    authorRole: c.authorRole,
    fromTeam: c.authorUserId !== null,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    attachments: c.attachments.map((a) => ({ id: a.id, url: a.fileUrl, name: a.fileName, mimeType: a.mimeType })),
    poll: c.poll ? toTeamPoll(c.poll, userId) : null,
  };
}
export const toThread = (c: ShareCommentRow & { replies: ShareCommentRow[] }, userId: string | null): TeamThreadComment => ({
  ...toThreadComment(c, userId),
  replies: c.replies.map((r) => toThreadComment(r, userId)),
});

export const threadInclude = {
  attachments: true,
  poll: POLL_INCLUDE,
  replies: { include: { attachments: true }, orderBy: { createdAt: "asc" as const } },
};
