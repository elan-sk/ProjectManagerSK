import { redirect } from "next/navigation";
import { auth } from "@/auth";
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
  const [profile, bot] = await Promise.all([getCompanyProfileUi(), getBotSettings()]);
  return <CompanyPageView profile={profile} aiConfigured={bot.apiKeyConfigured} />;
}
