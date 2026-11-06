import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SettingsNav } from "./SettingsNav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-slate-900">Configuración</h1>
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-8">
        <SettingsNav isAdmin={session.user.role === "ADMIN"} />
        <div className="min-w-0 flex-1 space-y-6">{children}</div>
      </div>
    </div>
  );
}
