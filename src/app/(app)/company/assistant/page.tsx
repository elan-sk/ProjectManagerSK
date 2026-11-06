import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getBotSettings } from "@/lib/botSettings";
import { CompanyAssistant } from "./CompanyAssistant";

export default async function CompanyAssistantPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") {
    return (
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-700">Esta sección es solo para administradores.</p>
        <Link href="/projects" className="text-sm font-medium text-slate-900 hover:underline">
          Ir a proyectos
        </Link>
      </div>
    );
  }
  const bot = await getBotSettings();
  return <CompanyAssistant botName={bot.name} botAvatarUrl={bot.avatarUrl} />;
}
