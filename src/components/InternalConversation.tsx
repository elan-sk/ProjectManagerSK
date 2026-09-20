import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CommentForm } from "@/components/CommentForm";
import { CommentItem } from "@/components/CommentItem";

export async function InternalConversation({ projectId, taskId = null, title }: { projectId: string; taskId?: string | null; title: string }) {
  const session = await auth();
  if (!session?.user) return null;
  const [people, messages] = await Promise.all([
    prisma.user.findMany({ where: { active: true, id: { not: session.user.id } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.internalMessage.findMany({
    where: { projectId, taskId },
    include: { author: { select: { name: true, avatarUrl: true } } },
    orderBy: { createdAt: "asc" },
    take: 100,
    }),
  ]);

  return (
    <section id="internal-conversation" className="scroll-mt-20 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500">Solo visible para el equipo dentro de ProjectManagerSK.</p>
      </div>
      <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-400">Aún no hay comentarios internos.</p>
        ) : (
          messages.map((m) => (
            <CommentItem
              key={m.id}
              id={m.id}
              authorId={m.authorId}
              authorName={m.author.name}
              authorAvatarUrl={m.author.avatarUrl}
              createdLabel={m.createdAt.toLocaleString("es-CO")}
              createdAtMs={m.createdAt.getTime()}
              body={m.body}
              edited={Boolean(m.editedAt)}
              currentUserId={session.user.id}
            />
          ))
        )}
      </div>
      <CommentForm projectId={projectId} taskId={taskId} people={people} />
    </section>
  );
}
