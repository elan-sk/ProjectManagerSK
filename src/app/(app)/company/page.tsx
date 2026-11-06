import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getBotSettings } from "@/lib/botSettings";
import { getCompanyProfileUi } from "./actions";
import { CompanyPageView } from "./CompanyPageView";

export default async function CompanyPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-100 bg-white p-8 text-center">
        <p className="text-[17px] text-slate-700">Esta sección es solo para administradores.</p>
      </div>
    );
  }
  const [profile, bot, clients] = await Promise.all([
    getCompanyProfileUi(),
    getBotSettings(),
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, logoUrl: true, _count: { select: { projects: { where: { status: { not: "ARCHIVED" } } } } } } }),
  ]);
  const rows = clients.map((c) => ({ id: c.id, name: c.name, logoUrl: c.logoUrl, projects: c._count.projects }));
  return <CompanyPageView profile={profile} aiConfigured={bot.apiKeyConfigured} clients={rows} />;
}
