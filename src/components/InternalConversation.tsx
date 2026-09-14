import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { postInternalMessage } from "@/app/(app)/internalMessageActions";
import { Avatar } from "@/components/Avatar";

export async function InternalConversation({ projectId, taskId = null, title }: { projectId: string; taskId?: string | null; title: string }) {
  const session = await auth();
  if (!session?.user) return null;
  const messages = await prisma.internalMessage.findMany({ where: { projectId, taskId }, include: { author: { select: { name: true, avatarUrl: true } } }, orderBy: { createdAt: "asc" }, take: 100 });
  return <section id="internal-conversation" className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-4 space-y-3"><div><h2 className="text-base font-semibold text-slate-900">{title}</h2><p className="text-xs text-slate-500">Solo visible para el equipo dentro de ProjectManagerSK.</p></div><div className="max-h-80 space-y-3 overflow-y-auto pr-1">{messages.length === 0 ? <p className="text-sm text-slate-400">Aún no hay comentarios internos.</p> : messages.map((m) => <article key={m.id} className="flex gap-2"><Avatar name={m.author.name} avatarUrl={m.author.avatarUrl} size="h-7 w-7 text-[10px]" /><div className="min-w-0"><p className="text-xs font-medium text-slate-700">{m.author.name} <span className="font-normal text-slate-400">{m.createdAt.toLocaleString("es-CO")}</span></p><p className="whitespace-pre-wrap text-sm text-slate-700">{m.body}</p></div></article>)}</div><form action={async (data) => { "use server"; await postInternalMessage(projectId, taskId, String(data.get("body") ?? "")); }} className="flex gap-2"><textarea name="body" required maxLength={3000} placeholder="Escribir comentario interno…" className="min-h-10 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" /><button className="self-end rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">Enviar</button></form></section>;
}
