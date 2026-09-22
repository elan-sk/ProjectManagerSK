import { redirect } from "next/navigation";
import { visibleProjectWhere } from "@/lib/permissions";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkDeadlineAlerts } from "@/lib/notifications";
import { getBotSettings } from "@/lib/botSettings";
import { LiveRefresh } from "@/components/LiveRefresh";
import { ChontatecWidget } from "./ChontatecWidget";
import { NotificationBell } from "./NotificationBell";
import { InternalMessageBell } from "./InternalMessageBell";
import { HeaderAlerts } from "./HeaderAlerts";
import { ActivityPing } from "./ActivityPing";
import { WhatsAppHealthAlert } from "./WhatsAppHealthAlert";
import { HeaderSearch } from "./HeaderSearch";
import { PushSubscribeButton } from "./PushSubscribeButton";
import { NavLinkWithMemory } from "./NavLinkWithMemory";
import { BackButton } from "./BackButton";
import { MobileMenuToggle } from "./MobileMenuToggle";
import { Avatar } from "@/components/Avatar";
import { ToastProvider } from "@/components/Toast";
import { ConfirmProvider } from "@/components/Confirm";

// Next.js 16: proxy.ts (ex-middleware) ya no es el lugar para auth — la
// verificación de sesión va en el layout/route handler, como pide la guía
// oficial de migración.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isAdmin = session.user.role === "ADMIN";
  const [me, pmProjectCount, botSettings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, avatarUrl: true },
    }),
    isAdmin ? Promise.resolve(0) : prisma.project.count({ where: { pmId: session.user.id } }),
    getBotSettings(),
  ]);
  // Una restauración completa puede reemplazar los usuarios y dejar en el
  // navegador una sesión JWT de la base anterior. No es un error de página:
  // mandamos a iniciar sesión otra vez, en lugar de hacer fallar todo el
  // layout con findUniqueOrThrow.
  if (!me) redirect("/login");
  await checkDeadlineAlerts(session.user.id);
  // Admin/PM van al informe grupal; un miembro normal va directo a su propio
  // rendimiento (ver performance/page.tsx y performance/[userId]/page.tsx).
  const performanceHref = isAdmin || pmProjectCount > 0 ? "/performance" : `/performance/${session.user.id}`;
  const [notifications, internalMessages] = await Promise.all([prisma.notification.findMany({
    where: { userId: session.user.id, read: false },
    include: { task: { select: { projectId: true } } },
    orderBy: { createdAt: "desc" },
  }), prisma.internalMessage.findMany({ where: { authorId: { not: session.user.id }, reads: { none: { userId: session.user.id } }, ...(isAdmin ? {} : { OR: [{ mentions: { some: { userId: session.user.id } } }, { project: { OR: [{ pmId: session.user.id }, { tasks: { some: { OR: [{ assignees: { some: { userId: session.user.id } } }, { reviewers: { some: { userId: session.user.id } } }] } } }] } }] }) }, include: { author: { select: { name: true } }, mentions: { where: { userId: session.user.id }, select: { userId: true } } }, orderBy: { createdAt: "desc" }, take: 20 })]);
  const bellItems = notifications.map((n) => ({
    id: n.id,
    message: n.message,
    type: n.type,
    taskId: n.taskId,
    // Punto 4: sin tarea (ej. comentario en Definición), el link es al
    // propio Notification.projectId — antes esto quedaba siempre null y la
    // campana no tenía cómo armar el link para ese caso.
    projectId: n.task?.projectId ?? n.projectId ?? null,
  }));

  // Alertas fijas del header (punto 10 confirmado con el usuario): siempre
  // visibles, no hay que entrar a un proyecto para verlas. "Devuelta" es
  // pura mía (soy asignado); "Revisión" cuenta toda ronda activa donde soy
  // revisor, tenga o no plantilla aplicada todavía — es un recordatorio para
  // entrar a revisarla, no solo un aviso de "ya está lista para marcar".
  // Ordenadas por urgencia: plannedEnd ascendente ya deja primero lo más
  // atrasado/próximo a vencer.
  // Urgentes: no completadas ni archivadas. Admin ve todas; el resto, las de
  // los proyectos que administra o donde es asignado/revisor (proyectos
  // ocultos, solo admin). No hay "marcar como leída": salen al completarse
  // o desmarcarse.
  const uid = session.user.id;
  const [urgentTasks, returnedTasks, pendingReviewTasks] = await Promise.all([
    prisma.task.findMany({
      where: {
        isUrgent: true,
        status: { not: "COMPLETED" },
        archivedAt: null,
        project: visibleProjectWhere(session.user),
        ...(isAdmin
          ? {}
          : { OR: [{ project: { pmId: uid } }, { assignees: { some: { userId: uid } } }, { reviewers: { some: { userId: uid } } }] }),
      },
      select: { id: true, title: true, projectId: true, plannedEnd: true },
      orderBy: { plannedEnd: "asc" },
    }),
    prisma.task.findMany({
      where: { status: "RETURNED", assignees: { some: { userId: session.user.id } }, project: visibleProjectWhere(session.user) },
      select: { id: true, title: true, projectId: true, plannedEnd: true },
      orderBy: { plannedEnd: "asc" },
    }),
    prisma.task.findMany({
      where: { reviewers: { some: { userId: session.user.id } }, reviewRounds: { some: { outcome: null } }, project: visibleProjectWhere(session.user) },
      select: { id: true, title: true, projectId: true, plannedEnd: true },
      orderBy: { plannedEnd: "asc" },
    }),
  ]);

  return (
    <ToastProvider>
    <ConfirmProvider>
    {/* Punto 1: montado acá (una sola vez, global) en vez de en páginas
        sueltas — antes la campana de notificaciones solo se refrescaba en
        las 3 páginas que la traían a mano, y en cualquier otra ruta
        (/agenda, /settings, etc.) quedaba pisada hasta recargar a mano. */}
    <LiveRefresh />
    <ActivityPing />
    <div className="pacific-shell min-h-screen bg-slate-50">
      <header className="pacific-header sticky top-0 z-50 relative flex items-center gap-2 px-4 py-1 sm:px-6">
        <div className="flex flex-shrink-0 items-center gap-2 text-sm font-medium">
          <BackButton />
          <Link href="/projects" aria-label="ProjectManagerSK — ir a proyectos" className="mr-1 flex items-center gap-2 text-slate-900">
            <span className="pacific-brand-mark" aria-hidden><span className="relative z-10 font-display text-xs font-bold">PM</span></span>
            <span className="font-display tracking-[-0.02em]">ProjectManager<span className="text-[color:var(--sand-warm)]">SK</span></span>
          </Link>
        </div>
        <MobileMenuToggle>
          <nav className="pacific-nav flex flex-col gap-1 text-sm font-medium lg:flex-shrink-0 lg:flex-row lg:items-center lg:gap-4">
            <NavLinkWithMemory href="/agenda" storageKey="lastAgendaView">
              Agenda
            </NavLinkWithMemory>
            <Link href={performanceHref}>Rendimiento</Link>
            <Link href="/settings">Configuración</Link>
          </nav>
          <HeaderSearch />
          <div className="flex flex-wrap items-center gap-3 lg:flex-shrink-0 lg:flex-nowrap">
            <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 lg:inline">
              Hoy: {new Date().toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" }).replace(" de ", " ")}
            </span>
            {isAdmin && <WhatsAppHealthAlert />}
            <PushSubscribeButton />
            <HeaderAlerts
              urgent={urgentTasks.map((t) => ({ id: t.id, title: t.title, projectId: t.projectId, plannedEnd: t.plannedEnd.toISOString() }))}
              returned={returnedTasks.map((t) => ({ id: t.id, title: t.title, projectId: t.projectId, plannedEnd: t.plannedEnd.toISOString() }))}
              pendingReviews={pendingReviewTasks.map((t) => ({ id: t.id, title: t.title, projectId: t.projectId, plannedEnd: t.plannedEnd.toISOString() }))}
            />
            <NotificationBell items={bellItems} userId={session.user.id} />
            <InternalMessageBell items={internalMessages.map((m) => ({ id: m.id, body: m.body, projectId: m.projectId, taskId: m.taskId, author: m.author.name, mentioned: m.mentions.length > 0 }))} />
            <Link href="/settings" className="flex items-center gap-2">
              <Avatar name={me.name} avatarUrl={me.avatarUrl} size="h-7 w-7 text-[11px]" />
            </Link>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login?logout=1" });
              }}
            >
              <span title={me.name} className="mr-3 text-sm text-slate-500">
                {/* Máx. 10 caracteres: con el buscador en el header no alcanza el ancho. */}
                {me.name.length > 10 ? `${me.name.slice(0, 10).trimEnd()}…` : me.name}
              </span>
              <button type="submit" className="text-sm text-slate-500 hover:text-slate-900">
                Salir
              </button>
            </form>
          </div>
        </MobileMenuToggle>
      </header>
      <main className="p-4 sm:p-6">{children}</main>
      <ChontatecWidget botName={botSettings.name} botAvatarUrl={botSettings.avatarUrl} />
    </div>
    </ConfirmProvider>
    </ToastProvider>
  );
}
