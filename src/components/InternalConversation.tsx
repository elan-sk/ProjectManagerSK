import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CommentForm } from "@/components/CommentForm";
import { CommentItem } from "@/components/CommentItem";
import { PollFrame, TeamPollCard } from "@/app/(app)/projects/[id]/tasks/[taskId]/TeamPollCard";
import { canEditTask, canParticipateInProject, getProjectAdmin } from "@/lib/permissions";
import { POLL_INCLUDE, toTeamPoll } from "@/lib/threadView";

export async function InternalConversation({ projectId, taskId = null, title }: { projectId: string; taskId?: string | null; title: string }) {
  const session = await auth();
  if (!session?.user) return null;
  // Quien participa puede responder las preguntas; cerrarlas, quien las publicó o quien administra.
  const [canVote, canCloseAny, canModerate] = await Promise.all([
    canParticipateInProject(projectId, taskId),
    taskId ? canEditTask(taskId) : getProjectAdmin(projectId).then(Boolean),
    getProjectAdmin(projectId).then(Boolean),
  ]);
  const [people, messages] = await Promise.all([
    prisma.user.findMany({ where: { active: true, id: { not: session.user.id } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.internalMessage.findMany({
    where: { projectId, taskId, reviewCheckId: null },
    include: { author: { select: { name: true, avatarUrl: true } }, poll: POLL_INCLUDE },
    orderBy: { createdAt: "asc" },
    take: 100,
    }),
  ]);

  return (
    <section id="internal-conversation" className="scroll-mt-20 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-[21px] font-semibold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500">Solo visible para el equipo dentro de ProjectManagerSK.</p>
      </div>
      <div className="space-y-3">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-400">Aún no hay comentarios internos.</p>
        ) : (
          messages.map((m) => {
            const item = (
              <CommentItem
                id={m.id}
                authorId={m.authorId}
                authorName={m.author.name}
                authorAvatarUrl={m.author.avatarUrl}
                createdLabel={m.createdAt.toLocaleString("es-CO", { timeZone: "America/Bogota" })}
                createdAtMs={m.createdAt.getTime()}
                body={m.body}
                edited={Boolean(m.editedAt)}
                currentUserId={session.user.id}
                asQuestion={Boolean(m.poll)}
                canModerate={canModerate}
              />
            );
            return m.poll ? (
              <PollFrame key={m.id}>
                {item}
                <TeamPollCard
                  key={`${m.poll.id}-${m.poll.options.map((o) => o.votes.length).join(",")}-${m.poll.closed}`}
                  poll={toTeamPoll(m.poll, session.user.id)}
                  canVote={canVote}
                  canClose={canCloseAny || m.authorId === session.user.id}
                />
              </PollFrame>
            ) : (
              <div key={m.id}>{item}</div>
            );
          })
        )}
      </div>
      <CommentForm projectId={projectId} taskId={taskId} people={people} allowPoll />
    </section>
  );
}
