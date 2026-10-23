import { Suspense } from "react";
import { NavigationProgress } from "@/components/NavigationProgress";
import { credentialVisibleWhere } from "@/lib/credentials";
import { redirect } from "next/navigation";
import { getHeaderAlertTasks } from "@/lib/headerAlerts";
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
import { HotkeyHints } from "@/components/Hotkey";
import { PushSubscribeButton } from "./PushSubscribeButton";
import { NavLinkWithMemory } from "./NavLinkWithMemory";
import { BackButton } from "./BackButton";
import { ScrollTopHandle } from "./ScrollTopHandle";
import { MobileMenuToggle } from "./MobileMenuToggle";
import { Avatar } from "@/components/Avatar";
import { ToastProvider } from "@/components/Toast";
import { ConfirmProvider } from "@/components/Confirm";
import { FeatureHints } from "@/components/FeatureHints";
import { activeFeatureHints } from "@/lib/featureHints";

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
  // Novedades vigentes que esta persona todavía no vio (cada una sale una sola vez).
  const activeHints = activeFeatureHints().map((h) => h.id);
  const seenHints = activeHints.length
    ? await prisma.userFeatureHint
        .findMany({ where: { userId: session.user.id, hintId: { in: activeHints } }, select: { hintId: true } })
        .catch(() => activeHints.map((hintId) => ({ hintId })))
    : [];
  const pendingHints = activeHints.filter((id) => !seenHints.some((s) => s.hintId === id));
  // Admin/PM van al informe grupal; un miembro normal va directo a su propio
  // rendimiento (ver performance/page.tsx y performance/[userId]/page.tsx).
  const performanceHref = isAdmin || pmProjectCount > 0 ? "/performance" : `/performance/${session.user.id}`;
  const [notifications, internalMessages] = await Promise.all([prisma.notification.findMany({
    where: { userId: session.user.id, read: false },
    include: { task: { select: { projectId: true } } },
    orderBy: { createdAt: "desc" },
  }), prisma.internalMessage.findMany({ where: { authorId: { not: session.user.id }, reads: { none: { userId: session.user.id } }, ...(isAdmin ? {} : { OR: [{ mentions: { some: { userId: session.user.id } } }, { project: { OR: [{ pmId: session.user.id }, { tasks: { some: { OR: [{ assignees: { some: { userId: session.user.id } } }, { reviewers: { some: { userId: session.user.id } } }] } } }] } }] }) }, include: { author: { select: { name: true } }, mentions: { where: { userId: session.user.id }, select: { userId: true } } }, orderBy: { createdAt: "desc" }, take: 20 })]);
  // Avisos de credencial: si la persona ya no tiene acceso (cambió la visibilidad), el aviso no se
  // muestra — ni siquiera el nombre de la credencial.
  const credentialIds = notifications.flatMap((n) => (n.credentialId ? [n.credentialId] : []));
  const visibleCredentialIds = new Set(
    credentialIds.length > 0
      ? (await prisma.credential.findMany({ where: { id: { in: credentialIds }, ...credentialVisibleWhere(session.user) }, select: { id: true } })).map((c) => c.id)
      : []
  );
  const bellItems = notifications.filter((n) => !n.credentialId || visibleCredentialIds.has(n.credentialId)).map((n) => ({
    id: n.id,
    message: n.message,
    type: n.type,
    taskId: n.taskId,
    // Punto 4: sin tarea (ej. comentario en Definición), el link es al
    // propio Notification.projectId — antes esto quedaba siempre null y la
    // campana no tenía cómo armar el link para ese caso.
    projectId: n.task?.projectId ?? n.projectId ?? null,
    credentialId: n.credentialId,
  }));

  // Alertas fijas del header (punto 10 confirmado con el usuario): siempre visibles. Misma regla
  // que el resumen diario de WhatsApp (ver headerAlerts.ts). No hay "marcar como leída".
  const { urgent: urgentTasks, returned: returnedTasks, pendingReviews: pendingReviewTasks } = await getHeaderAlertTasks(session.user);

  return (
    <ToastProvider>
    <ConfirmProvider>
    {/* Punto 1: montado acá (una sola vez, global) en vez de en páginas
        sueltas — antes la campana de notificaciones solo se refrescaba en
        las 3 páginas que la traían a mano, y en cualquier otra ruta
        (/agenda, /settings, etc.) quedaba pisada hasta recargar a mano. */}
    <LiveRefresh />
    <ActivityPing />
    {/* Barra y «Cargando…» mientras navega (links, filtros, buscador). Suspense: usa useSearchParams. */}
    <Suspense fallback={null}>
      <NavigationProgress />
    </Suspense>
    <div className="pacific-shell min-h-screen bg-slate-50">
      {/* Imanes de scroll del tablero y el Gantt (ver globals.css). */}
      <div aria-hidden className="snap-point-start" />
      <header className="pacific-header sticky top-0 z-50 relative flex items-center gap-2 px-4 py-1 sm:px-6">
        <div className="flex flex-shrink-0 items-center gap-2 text-sm font-medium">
          <BackButton />
          <Link href="/projects" aria-label="ProjectManagerSK — ir a proyectos" className="pacific-brand mr-1 flex items-center gap-2 text-slate-900">
            <span className="pacific-brand-mark" aria-hidden><span className="relative z-10 font-display text-xs font-bold">PM</span></span>
            <span className="font-display tracking-[-0.02em]">ProjectManager<span className="pacific-brand-sk">SK</span></span>
          </Link>
        </div>
        <MobileMenuToggle search={<HeaderSearch />}>
          <nav className="pacific-nav order-2 flex flex-col gap-0.5 text-sm font-medium lg:order-1 lg:flex-shrink-0 lg:flex-row lg:items-center lg:gap-4">
            <NavLinkWithMemory href="/agenda" storageKey="lastAgendaView">
              Agenda
            </NavLinkWithMemory>
            <Link href={performanceHref}>Rendimiento</Link>
            <Link href="/settings">Configuración</Link>
          </nav>
          <div className="order-3 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3 lg:flex-shrink-0 lg:flex-nowrap lg:border-t-0 lg:pt-0">
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
            <NotificationBell items={bellItems} />
            <InternalMessageBell items={internalMessages.map((m) => ({ id: m.id, body: m.body, projectId: m.projectId, taskId: m.taskId, author: m.author.name, mentioned: m.mentions.length > 0 }))} />
          </div>
          <div className="order-1 flex items-center gap-3 border-b border-slate-200 pb-3 lg:order-4 lg:flex-shrink-0 lg:border-b-0 lg:pb-0">
            <Link href="/settings" className="flex items-center gap-2">
              <Avatar name={me.name} avatarUrl={me.avatarUrl} size="h-9 w-9 text-xs lg:h-7 lg:w-7 lg:text-[11px]" />
            </Link>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login?logout=1" });
              }}
              className="flex min-w-0 flex-1 items-center justify-between gap-3 lg:block lg:flex-none"
            >
              <span title={me.name} className="mr-3 truncate text-sm text-slate-500 max-lg:font-medium">
                {/* Máx. 10 caracteres: con el buscador en el header no alcanza el ancho. */}
                {me.name.length > 10 ? `${me.name.slice(0, 10).trimEnd()}…` : me.name}
              </span>
              <button type="submit" className="flex-shrink-0 cursor-pointer text-sm text-slate-500 hover:text-slate-900 max-lg:rounded-lg max-lg:border max-lg:border-slate-300 max-lg:px-3 max-lg:py-1.5">
                Salir
              </button>
            </form>
          </div>
        </MobileMenuToggle>
      </header>
      <main className="p-4 sm:p-6">{children}</main>
      <div aria-hidden className="snap-point-end" />
      <ScrollTopHandle />
      <ChontatecWidget botName={botSettings.name} botAvatarUrl={botSettings.avatarUrl} />
      <HotkeyHints />
      <FeatureHints pending={pendingHints} />
    </div>
    </ConfirmProvider>
    </ToastProvider>
  );
}
