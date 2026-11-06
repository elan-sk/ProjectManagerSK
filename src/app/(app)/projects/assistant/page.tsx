import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getBotSettings } from "@/lib/botSettings";
import { canUseProjectAssistant, chatSeed } from "@/lib/projectAssistant";
import { ProjectAssistant } from "./ProjectAssistant";

export default async function ProjectAssistantPage({ searchParams }: { searchParams: Promise<{ project?: string; from?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const params = await searchParams;
  const projectId = params.project || null;
  if (!(await canUseProjectAssistant(session.user, projectId))) {
    return (
      <div className="mx-auto max-w-xl space-y-2 rounded-3xl border border-slate-100 bg-white p-8 text-center">
        <p className="text-[17px] text-slate-700">No tiene acceso a este asistente.</p>
        <Link href="/projects" className="text-sm font-medium text-slate-900 hover:underline">
          Ir a proyectos
        </Link>
      </div>
    );
  }
  const bot = await getBotSettings();
  const seed = params.from === "chat" ? await chatSeed(session.user.id) : null;
  return <ProjectAssistant key={projectId ?? "new"} projectId={projectId} botName={bot.name} botAvatarUrl={bot.avatarUrl} seed={seed} />;
}
