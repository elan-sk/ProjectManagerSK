import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getBotSettings } from "@/lib/botSettings";
import { ClientAssistant } from "./ClientAssistant";

export default async function ClientAssistantPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-100 bg-white p-8 text-center">
        <p className="text-[17px] text-slate-700">Esta sección es solo para administradores.</p>
      </div>
    );
  }
  const clientId = (await searchParams).client || null;
  const client = clientId ? await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } }) : null;
  if (clientId && !client) notFound();
  const bot = await getBotSettings();
  return <ClientAssistant key={clientId ?? "new"} clientId={clientId} clientName={client?.name ?? null} botName={bot.name} botAvatarUrl={bot.avatarUrl} />;
}
