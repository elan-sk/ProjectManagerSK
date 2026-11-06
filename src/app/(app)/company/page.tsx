import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getBotSettings } from "@/lib/botSettings";
import { computeIndicators, daysAgo, rankByIntent } from "@/lib/companyIndicators";
import { listLearnings } from "@/lib/learnings";
import { LearningsPanel } from "../LearningsPanel";
import { toLearningUi } from "../learningUi";
import { getCompanyProfileUi } from "./actions";
import { CompanyPageView } from "./CompanyPageView";
import { CompanyDashboard, DASHBOARD_PERIODS } from "./CompanyDashboard";

export default async function CompanyPage({ searchParams }: { searchParams: Promise<{ periodo?: string; cliente?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-100 bg-white p-8 text-center">
        <p className="text-[17px] text-slate-700">Esta sección es solo para administradores.</p>
      </div>
    );
  }
  const params = await searchParams;
  const period = DASHBOARD_PERIODS.find((p) => p.id === params.periodo) ?? DASHBOARD_PERIODS[1];
  const clientId = params.cliente || undefined;
  const [profile, bot, clients, indicators, learnings, archived] = await Promise.all([
    getCompanyProfileUi(),
    getBotSettings(),
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, logoUrl: true, _count: { select: { projects: { where: { status: { not: "ARCHIVED" } } } } } } }),
    computeIndicators({ from: daysAgo(period.days), clientId }),
    listLearnings(session.user),
    prisma.project.findMany({ where: { archivedAt: { not: null }, status: { not: "ARCHIVED" }, learnings: { none: {} } }, orderBy: { archivedAt: "desc" }, select: { id: true, name: true } }),
  ]);
  const intent = profile.items.find((i) => i.key === "app_goals")?.text ?? null;
  const rows = clients.map((c) => ({ id: c.id, name: c.name, logoUrl: c.logoUrl, projects: c._count.projects }));
  return (
    <CompanyPageView
      profile={profile}
      aiConfigured={bot.apiKeyConfigured}
      clients={rows}
      dashboard={<CompanyDashboard indicators={rankByIntent(indicators, intent)} period={period.id} clientId={clientId} clients={clients.map((c) => ({ id: c.id, label: c.name }))} />}
      learnings={<LearningsPanel learnings={learnings.map(toLearningUi)} projectId={null} canGenerate isAdmin aiConfigured={bot.apiKeyConfigured} showProject archived={archived} />}
    />
  );
}
