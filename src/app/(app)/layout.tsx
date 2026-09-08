import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkDeadlineAlerts } from "@/lib/notifications";
import { NotificationBell } from "./NotificationBell";
import { PushSubscribeButton } from "./PushSubscribeButton";
import { ProjectsNavLink } from "./ProjectsNavLink";
import { NavLinkWithMemory } from "./NavLinkWithMemory";
import { Avatar } from "@/components/Avatar";

// Next.js 16: proxy.ts (ex-middleware) ya no es el lugar para auth — la
// verificación de sesión va en el layout/route handler, como pide la guía
// oficial de migración.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  await checkDeadlineAlerts(session.user.id);
  const isAdmin = session.user.role === "ADMIN";
  const [me, pmProjectCount] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { name: true, avatarUrl: true },
    }),
    isAdmin ? Promise.resolve(0) : prisma.project.count({ where: { pmId: session.user.id } }),
  ]);
  // "Rendimiento" es privilegio de admin/PM (ver performance/page.tsx) — un
  // miembro normal no lo ve en el nav, ya que entrar lo redirige igual.
  const canSeePerformance = isAdmin || pmProjectCount > 0;
  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id, read: false },
    include: { task: { select: { projectId: true } } },
    orderBy: { createdAt: "desc" },
  });
  const bellItems = notifications.map((n) => ({
    id: n.id,
    message: n.message,
    type: n.type,
    taskId: n.taskId,
    projectId: n.task?.projectId ?? null,
  }));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <nav className="flex items-center gap-4 text-sm font-medium text-slate-700">
          <ProjectsNavLink />
          <NavLinkWithMemory href="/agenda" storageKey="lastAgendaView">
            Agenda
          </NavLinkWithMemory>
          {canSeePerformance && <Link href="/performance">Rendimiento</Link>}
          <Link href="/settings">Configuración</Link>
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-slate-400 sm:inline">
            Hoy: {new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}
          </span>
          <PushSubscribeButton />
          <NotificationBell items={bellItems} userId={session.user.id} />
          <Link href="/settings" className="flex items-center gap-2">
            <Avatar name={me.name} avatarUrl={me.avatarUrl} size="h-7 w-7 text-[11px]" />
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <span className="mr-3 text-sm text-slate-500">{me.name}</span>
            <button type="submit" className="text-sm text-slate-500 hover:text-slate-900">
              Salir
            </button>
          </form>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
