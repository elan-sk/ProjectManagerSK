import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkDeadlineAlerts } from "@/lib/notifications";
import { getBotSettings } from "@/lib/botSettings";
import { ChontatecWidget } from "./ChontatecWidget";
import { NotificationBell } from "./NotificationBell";
import { HeaderAlerts } from "./HeaderAlerts";
import { PushSubscribeButton } from "./PushSubscribeButton";
import { NavLinkWithMemory } from "./NavLinkWithMemory";
import { BackButton } from "./BackButton";
import { Avatar } from "@/components/Avatar";
import { ToastProvider } from "@/components/Toast";
import { ConfirmProvider } from "@/components/Confirm";

// Next.js 16: proxy.ts (ex-middleware) ya no es el lugar para auth — la
// verificación de sesión va en el layout/route handler, como pide la guía
// oficial de migración.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  await checkDeadlineAlerts(session.user.id);
  const isAdmin = session.user.role === "ADMIN";
  const [me, pmProjectCount, botSettings] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { name: true, avatarUrl: true },
    }),
    isAdmin ? Promise.resolve(0) : prisma.project.count({ where: { pmId: session.user.id } }),
    getBotSettings(),
  ]);
  // Admin/PM van al informe grupal; un miembro normal va directo a su propio
  // rendimiento (ver performance/page.tsx y performance/[userId]/page.tsx).
  const performanceHref = isAdmin || pmProjectCount > 0 ? "/performance" : `/performance/${session.user.id}`;
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

  // Alertas fijas del header (punto 10 confirmado con el usuario): siempre
  // visibles, no hay que entrar a un proyecto para verlas. "Devuelta" es
  // pura mía (soy asignado); "Revisión" cuenta toda ronda activa donde soy
  // revisor, tenga o no plantilla aplicada todavía — es un recordatorio para
  // entrar a revisarla, no solo un aviso de "ya está lista para marcar".
  // Ordenadas por urgencia: plannedEnd ascendente ya deja primero lo más
  // atrasado/próximo a vencer.
  const [returnedTasks, pendingReviewTasks] = await Promise.all([
    prisma.task.findMany({
      where: { status: "RETURNED", assignees: { some: { userId: session.user.id } } },
      select: { id: true, title: true, projectId: true, plannedEnd: true },
      orderBy: { plannedEnd: "asc" },
    }),
    prisma.task.findMany({
      where: { reviewers: { some: { userId: session.user.id } }, reviewRounds: { some: { outcome: null } } },
      select: { id: true, title: true, projectId: true, plannedEnd: true },
      orderBy: { plannedEnd: "asc" },
    }),
  ]);

  return (
    <ToastProvider>
    <ConfirmProvider>
    <div className="pacific-shell min-h-screen bg-slate-50">
      <header className="pacific-header sticky top-0 z-50 relative flex items-center justify-between px-4 py-1 sm:px-6">
        <nav className="pacific-nav flex items-center gap-4 text-sm font-medium">
          <BackButton />
          <Link href="/projects" aria-label="ProjectManagerSK — ir a proyectos" className="mr-1 flex items-center gap-2 text-slate-900">
            <span className="pacific-brand-mark" aria-hidden><span className="relative z-10 font-display text-xs font-bold">PM</span></span>
            <span className="hidden font-display tracking-[-0.02em] sm:inline">ProjectManager<span className="text-[color:var(--sand-warm)]">SK</span></span>
          </Link>
          <NavLinkWithMemory href="/agenda" storageKey="lastAgendaView">
            Agenda
          </NavLinkWithMemory>
          <Link href={performanceHref}>Rendimiento</Link>
          <Link href="/settings">Configuración</Link>
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 lg:inline">
            Hoy: {new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}
          </span>
          <PushSubscribeButton />
          <HeaderAlerts
            returned={returnedTasks.map((t) => ({ id: t.id, title: t.title, projectId: t.projectId, plannedEnd: t.plannedEnd.toISOString() }))}
            pendingReviews={pendingReviewTasks.map((t) => ({ id: t.id, title: t.title, projectId: t.projectId, plannedEnd: t.plannedEnd.toISOString() }))}
          />
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
      <main className="p-4 sm:p-6">{children}</main>
      <ChontatecWidget botName={botSettings.name} botAvatarUrl={botSettings.avatarUrl} />
    </div>
    </ConfirmProvider>
    </ToastProvider>
  );
}
