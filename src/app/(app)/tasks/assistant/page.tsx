import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getBotSettings } from "@/lib/botSettings";
import { canUseTaskAssistant, chatSeed } from "@/lib/projectAssistant";
import { TaskAssistant } from "./TaskAssistant";

type Params = { project?: string; task?: string; title?: string; description?: string; from?: string };

export default async function TaskAssistantPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const p = await searchParams;
  const projectId = p.project ?? "";
  const taskId = p.task || null;
  const projectExists = Boolean(projectId) && (await prisma.project.count({ where: { id: projectId } })) > 0;
  if (!projectExists || !(await canUseTaskAssistant(session.user, projectId, taskId))) {
    return (
      <div className="mx-auto max-w-xl space-y-2 rounded-3xl border border-slate-100 bg-white p-8 text-center">
        <p className="text-[17px] text-slate-700">{projectExists ? "No tiene acceso a este asistente." : "Falta elegir el proyecto: el asistente de tareas se abre desde un proyecto."}</p>
        <Link href="/projects" className="text-sm font-medium text-slate-900 hover:underline">
          Ir a proyectos
        </Link>
      </div>
    );
  }
  const [bot, project, task] = await Promise.all([
    getBotSettings(),
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { name: true } }),
    taskId ? prisma.task.findUnique({ where: { id: taskId }, select: { title: true } }) : null,
  ]);
  const fromForm = [p.title?.trim() && `Título: ${p.title.trim()}`, p.description?.trim() && `Descripción: ${p.description.trim()}`].filter(Boolean).join("\n");
  const seed = p.from === "chat" ? await chatSeed(session.user.id) : fromForm ? `Punto de partida (lo que escribí en el formulario):\n${fromForm}` : null;
  return <TaskAssistant key={`${projectId}:${taskId ?? "new"}`} projectId={projectId} taskId={taskId} title={task?.title ?? project.name} botName={bot.name} botAvatarUrl={bot.avatarUrl} seed={seed} />;
}
