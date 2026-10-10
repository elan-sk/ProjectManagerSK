import { auth } from "@/auth";
import { managedProjectWhere, visibleProjectWhere } from "@/lib/permissions";
import { hiddenProjectsPref } from "@/lib/hiddenProjectsPref";
import { ShowHiddenProjectsToggle } from "@/components/ShowHiddenProjectsToggle";
import { AlertBadge } from "@/components/AlertBadge";
import { AvatarGroup } from "@/components/Avatar";
import { ComboFilter } from "@/components/ComboFilter";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { ResetFiltersButton } from "@/components/ResetFiltersButton";
import { matchesDateRange, parseDayKey } from "@/lib/dateRange";
import { ATTRIBUTE_TYPE_OPTIONS, attributeTypeTriggerClass, hasUploadedFiles, isAttributeType, matchesAttributeType } from "@/lib/taskTypeFilter";
import { ClockIcon, LockIcon, PlayIcon, UrgentIcon, WarningIcon } from "@/components/icons";
import { ProjectIcon } from "@/components/ProjectIcon";
import { SubprojectsPopover } from "@/app/(app)/projects/[id]/SubprojectsPanel";
import { TaskIndicators } from "@/components/TaskIndicators";
import { SearchBox } from "@/components/SearchBox";
import { TagChip } from "@/components/TagChip";
import { getPmProjectsSummary, groupPmSummaries, tallyAgendaCounts, type AgendaCounts } from "@/lib/agendaSummary";
import { getRecentOnTimeTrend, getTaskAlert, getUserPerformance, matchesRiskFilter, type TaskAlert } from "@/lib/delays";
import { prisma } from "@/lib/prisma";
import { getFailureAnalysisByUser, getRecentFirstPassTrend, getReviewPerformance, reviewRates, type RecentTrend } from "@/lib/reviewPerformance";
import { getUserActivityStats } from "@/lib/activity";
import { PERFORMANCE_GOALS } from "@/lib/performanceGoals";
import { matchesTaskSearch } from "@/lib/search";
import { buildTagFilterOptions, matchesTagFilter } from "@/lib/tags";
import { HEALTH_LABEL } from "@/lib/projectHealth";
import { projectStatus, scheduleVarianceExact } from "@/lib/scheduleVarianceLabel";
import { TASK_STATUS_COLOR, TASK_STATUS_LABEL, TASK_TYPE_LABEL, taskCardTint, isStartingSoon } from "@/lib/statusColors";
import { ProjectCardsOrder } from "../projects/ProjectCardsOrder";
import type { TaskStatus } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RememberViewState } from "../RememberViewState";

const HEALTH_DOT: Record<keyof typeof HEALTH_LABEL, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-red-500",
};
const HEALTH_TEXT: Record<keyof typeof HEALTH_LABEL, string> = {
  ok: "text-emerald-700",
  warn: "text-amber-700",
  bad: "text-red-700",
};

const DATE_FMT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", timeZone: "UTC" };
const DAY_HEADER_FMT: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" };

type AgendaCard = {
  id: string;
  projectId: string;
  projectName: string;
  projectIconUrl: string | null;
  projectParent: { name: string; iconUrl: string | null } | null;
  title: string;
  isUrgent: boolean;
  attachmentsCount: number;
  shareToken: string | null;
  status: TaskStatus;
  tags: { id: string; categoryId: string; categoryName: string; name: string; colorHex: string; emoji: string | null }[];
  assignees: { name: string; avatarUrl: string | null }[];
  plannedStart: string;
  plannedEnd: string;
  alert: TaskAlert;
};

// Mismo criterio de color y ORDEN de importancia que ya usan /projects y
// /projects/[id] (filtro Alerta: Inicio retrasado → Por vencer → Final
// retrasado): azul=inicio retrasado (NOTIFICATION_TYPE_COLOR.LATE_START),
// ámbar=por vencer, rojo=final retrasado, rosa=bloqueada (ALERT_STYLE.blocked),
// azul=tareas nuevas (misma familia que ASSIGNED).
const TILES: {
  key: keyof AgendaCounts;
  label: string;
  dot: string;
  text: string;
  border: string;
  activeBg: string;
  overrides: (active: boolean) => Record<string, string | undefined>;
  isActive: (params: { status?: string; risk?: string; type?: string }) => boolean;
}[] = [
  {
    key: "lateStart",
    label: "Inicio retrasado",
    dot: "bg-blue-400",
    text: "text-blue-700",
    // Un escalón más saturado que el resto (border-300/bg-200 en vez de
    // 200/100): el fondo de la app es un degradé frío parecido, y el azul
    // pálido se perdía contra él (reportado por el usuario con captura).
    border: "border-blue-300",
    activeBg: "bg-blue-200",
    overrides: (active) => ({ risk: active ? undefined : "lateStart" }),
    isActive: (p) => p.risk === "lateStart",
  },
  {
    key: "warning",
    label: "Por vencer",
    dot: "bg-amber-500",
    text: "text-amber-700",
    border: "border-amber-200",
    activeBg: "bg-amber-100",
    overrides: (active) => ({ risk: active ? undefined : "warning" }),
    isActive: (p) => p.risk === "warning",
  },
  {
    key: "overdue",
    label: "Final retrasado",
    dot: "bg-red-500",
    text: "text-red-700",
    border: "border-red-200",
    activeBg: "bg-red-100",
    overrides: (active) => ({ risk: active ? undefined : "overdue" }),
    isActive: (p) => p.risk === "overdue",
  },
  {
    key: "blocked",
    label: "Bloqueadas",
    dot: "bg-rose-500",
    text: "text-rose-700",
    border: "border-rose-200",
    activeBg: "bg-rose-100",
    overrides: (active) => ({ status: active ? undefined : "BLOCKED" }),
    isActive: (p) => p.status === "BLOCKED",
  },
  {
    key: "unopened",
    label: "Tareas Nuevas",
    // Violeta propio (no compartido con "Inicio retrasado"): dos tiles del
    // mismo azul se confundían entre sí, y encima el azul se perdía contra
    // el fondo frío de la app.
    dot: "bg-violet-500",
    text: "text-violet-700",
    border: "border-violet-300",
    activeBg: "bg-violet-200",
    overrides: (active) => ({ type: active ? undefined : "NEW" }),
    isActive: (p) => p.type === "NEW",
  },
];

function dayHeader(iso: string) {
  const date = new Date(iso);
  const key = iso.slice(0, 10);
  const todayKey = new Date().toISOString().slice(0, 10);
  const tomorrowKey = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const formatted = date.toLocaleDateString("es-CO", DAY_HEADER_FMT);
  const capitalized = formatted.charAt(0).toUpperCase() + formatted.slice(1);
  if (key === todayKey) return `Hoy · ${capitalized}`;
  if (key === tomorrowKey) return `Mañana · ${capitalized}`;
  return capitalized;
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{
    projectId?: string;
    status?: TaskStatus;
    userId?: string;
    risk?: "lateStart" | "overdue" | "warning" | "startingSoon";
    type?: string;
    q?: string;
    from?: string;
    to?: string;
    /** Etiqueta (id) o categoría (`cat:<id>`), igual que en Proyectos. */
    tag?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { projectId, status, userId, risk, type, q, tag, from: fromParam, to: toParam } = await searchParams;
  const from = parseDayKey(fromParam);
  const to = parseDayKey(toParam);

  // Ver la agenda de otra persona es un privilegio de PM/admin: un miembro
  // normal solo puede ver sus propias tareas, sin importar qué userId venga
  // en la URL. Un PM además queda acotado a los proyectos que administra —
  // no a cualquier proyecto de la app.
  const isAdmin = session.user.role === "ADMIN";
  const pmProjectIds = isAdmin
    ? null
    : (await prisma.project.findMany({ where: managedProjectWhere(session.user.id), select: { id: true } })).map((p) => p.id);
  const viewingOther = Boolean(userId && userId !== session.user.id);
  const canViewOthers = isAdmin || Boolean(pmProjectIds && pmProjectIds.length > 0);
  const effectiveUserId = viewingOther && canViewOthers ? userId! : session.user.id;
  const scopedProjectIds =
    viewingOther && canViewOthers && !isAdmin
      ? projectId
        ? pmProjectIds!.includes(projectId)
          ? [projectId]
          : []
        : pmProjectIds!
      : null;

  // Tareas de proyectos ocultos: solo con «Incluir proyectos ocultos» (o entrando al proyecto).
  // «Mis proyectos» y «Mi rendimiento» no cambian.
  const hiddenPref = await hiddenProjectsPref(session.user);

  const [tasksRaw, projects, users, pmSummary, myPerf] = await Promise.all([
    prisma.task.findMany({
      where: {
        assignees: { some: { userId: effectiveUserId } },
        projectId: scopedProjectIds ? { in: scopedProjectIds } : projectId || undefined,
        status: status || undefined,
        archivedAt: null,
        project: hiddenPref.projectWhere,
      },
      include: {
        project: { include: { parent: { select: { name: true, iconUrl: true } } } },
        assignees: { include: { user: true } },
        taskTags: { include: { tag: { include: { category: true } } } },
        attachments: { select: { fileName: true, mimeType: true } },
      },
      orderBy: { plannedStart: "asc" },
    }),
    prisma.project.findMany({
      where: { tasks: { some: { assignees: { some: { userId: session.user.id } } } }, ...hiddenPref.projectWhere },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // "Mis proyectos"/"Mi rendimiento" — solo tienen sentido en tu propia
    // agenda, nunca mirando la de otra persona.
    viewingOther ? Promise.resolve([]) : getPmProjectsSummary(session.user.id, session.user, { withSubprojects: true }).then(groupPmSummaries),
    viewingOther ? Promise.resolve(null) : getMyPerformanceSummary(session.user.id, session.user.role === "ADMIN" ? session.user : null),
  ]);

  // Links de compartir activos de estas tareas: alimentan el indicador (igual que en las demás vistas) y el filtro «Compartidas».
  const shareTokenByTaskId = new Map(
    (
      await prisma.shareLink.findMany({
        where: { targetType: "TASK", revokedAt: null, taskId: { in: tasksRaw.map((t) => t.id) } },
        select: { taskId: true, token: true },
      })
    ).map((l) => [l.taskId!, l.token])
  );
  const sharedTaskIds = new Set<string | null>(shareTokenByTaskId.keys());

  const tasksWithAlert = await Promise.all(
    tasksRaw.map(async (t) => ({ ...t, alert: await getTaskAlert(t.project.countryCode, t) }))
  );
  const tasks = tasksWithAlert
    .filter((t) => matchesRiskFilter(t.alert, risk))
    // Tipo: un tipo de tarea, o una opción de atributo (Nuevas / Archivos
    // adjuntos / Compartidas — ver taskTypeFilter.ts).
    .filter((t) => {
      if (!type) return true;
      if (!isAttributeType(type)) return t.type === type;
      return matchesAttributeType(type, {
        isNewForMe: t.assignees.find((a) => a.userId === effectiveUserId)?.viewedAt == null,
        hasFiles: hasUploadedFiles(t.attachments),
        isShared: sharedTaskIds.has(t.id),
      });
    })
    .filter((t) => matchesDateRange(t, from, to))
    .filter((t) => matchesTaskSearch(t, q))
    .filter((t) => matchesTagFilter(tag, t.taskTags.map((tt) => ({ tagId: tt.tagId, categoryId: tt.tag.categoryId }))));
  // Opciones del filtro Etiqueta: las que usan las tareas de esta agenda (antes de filtrar).
  const agendaTagCategories = [...new Map(tasksRaw.flatMap((t) => t.taskTags.map((tt) => [tt.tag.category.id, tt.tag.category] as const))).values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  const agendaTags = [...new Map(tasksRaw.flatMap((t) => t.taskTags.map((tt) => [tt.tagId, { id: tt.tagId, categoryId: tt.tag.categoryId, name: tt.tag.name }] as const))).values()];

  // Los tiles reflejan la lista filtrada de abajo (misma regla de conteo que
  // el resumen diario de WhatsApp, ver tallyAgendaCounts).
  const counts = tallyAgendaCounts(
    tasks.map((t) => ({ status: t.status, alert: t.alert, viewedAt: t.assignees.find((a) => a.userId === effectiveUserId)?.viewedAt }))
  );

  const cards: AgendaCard[] = tasks.map((t) => ({
    id: t.id,
    projectId: t.projectId,
    projectName: t.project.name,
    projectIconUrl: t.project.iconUrl,
    projectParent: t.project.parent,
    title: t.title,
    isUrgent: t.isUrgent && t.status !== "COMPLETED",
    attachmentsCount: t.attachments.length,
    shareToken: shareTokenByTaskId.get(t.id) ?? null,
    status: t.status,
    tags: t.taskTags.map((tt) => ({ id: tt.tagId, categoryId: tt.tag.categoryId, categoryName: tt.tag.category.name, name: tt.tag.name, colorHex: tt.tag.category.colorHex, emoji: tt.tag.category.emoji })),
    assignees: t.assignees.map((a) => ({ name: a.user.name, avatarUrl: a.user.avatarUrl })),
    plannedStart: t.plannedStart.toISOString(),
    plannedEnd: t.plannedEnd.toISOString(),
    alert: t.alert,
  }));

  // Agrupado por día calendario de plannedStart (ya viene ordenado ascendente
  // de la query) — vista de agenda real, no un grid de cards.
  const groups: { key: string; cards: AgendaCard[] }[] = [];
  // Las urgentes van ancladas arriba, en su propio bloque.
  const urgentCards = cards.filter((c) => c.isUrgent);
  if (urgentCards.length > 0) groups.push({ key: "urgent", cards: urgentCards });
  for (const card of cards.filter((c) => !c.isUrgent)) {
    const key = card.plannedStart.slice(0, 10);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup?.key === key) lastGroup.cards.push(card);
    else groups.push({ key, cards: [card] });
  }


  function agendaHref(overrides: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    const merged: Record<string, string | undefined> = { projectId, status, userId, risk, type, q, from, to, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `/agenda?${p.toString()}`;
  }

  return (
    <div className="space-y-4">
      <RememberViewState storageKey="lastAgendaView" />
      <h1 className="text-2xl font-semibold text-slate-900">Agenda</h1>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {/* Cada indicador solo activa/quita su propia condición y respeta los
            demás filtros activos (proyecto, persona, fechas, búsqueda…). */}
        {TILES.map((tile) => {
          const active = tile.isActive({ status, risk, type });
          return (
            <Link
              key={tile.key}
              href={agendaHref(tile.overrides(active))}
              className={`flex flex-col gap-1 rounded-xl border-2 px-3 py-2.5 transition hover:shadow-sm ${tile.border} ${
                active ? tile.activeBg : "bg-white"
              }`}
            >
              <span className={`flex items-center gap-1.5 text-xs font-medium ${tile.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${tile.dot}`} />
                {tile.label}
              </span>
              <span className={`text-2xl font-bold ${tile.text}`}>{counts[tile.key]}</span>
            </Link>
          );
        })}
      </div>

      {!viewingOther && (
        <div className={`grid grid-cols-1 gap-3 ${pmSummary.length > 0 ? "md:grid-cols-2" : ""}`}>
          <div className="flex min-h-48 flex-col rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-slate-400">Mi rendimiento</p>
              <Link href={`/performance/${session.user.id}`} className="text-xs text-slate-400 hover:text-slate-700">
                Ver detalle →
              </Link>
            </div>
            {myPerf && <div className="flex flex-1 flex-col justify-center"><MyPerformanceStats perf={myPerf} /></div>}
          </div>

          {pmSummary.length > 0 && (
            <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-3.5">
              <p className="mb-2 text-xs font-medium text-slate-400">Mis proyectos</p>
              {/* Misma altura que «Mi rendimiento» (la fila de la grilla la
                  define esa tarjeta): la lista va en absolute, así no estira
                  la fila, y lo que no entra se ve con scroll. Mínimo 3 filas
                  (28px c/u + 2 separaciones de 4px) para el celular, donde las
                  tarjetas van apiladas. Overflow explícito en los dos ejes. */}
              <div className="relative min-h-23 flex-1">
              <div className="absolute inset-0 space-y-1 overflow-y-auto overflow-x-hidden pr-1">
                {/* Mismo orden que el resumen de Proyectos: último abierto primero,
                    el resto por creación (más reciente primero). */}
                <ProjectCardsOrder
                  items={pmSummary.map((p) => {
                  const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
                  return { id: p.id, node: (
                  <div key={p.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-50">
                    <Link href={`/projects/${p.id}`} className="flex flex-shrink-0 items-center gap-1.5">
                      {/* Subproyecto suelto (su principal no está en la lista): doble ícono (spec 004). */}
                      <ProjectIcon name={p.name} iconUrl={p.iconUrl} parent={p.parent} size="h-5 w-5 text-[9px]" />
                      {/* Ancho máximo fijo: un nombre largo no debe empujar el
                          resto de la fila ni romper el layout. */}
                      <span className="max-w-[110px] truncate text-sm font-medium text-slate-800">{p.name}</span>
                    </Link>
                    {/* Principal: grupito de logos de sus subproyectos (como los asignados de una tarea). */}
                    {p.subprojects && <SubprojectsPopover subprojects={p.subprojects} size="h-4 w-4 text-[7px]" max={3} />}
                    <div className="flex flex-shrink-0 items-center gap-1.5">
                      <div className="h-1.5 w-16 flex-shrink-0 overflow-hidden bg-slate-100">
                        <div className="progress-fill-emerald h-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="flex-shrink-0 text-[11px] text-slate-400">
                        {pct}% · {p.completed}/{p.total}
                      </span>
                    </div>
                    {/* Salud justo después de la barra de progreso, pero las
                        alertas siguen pegadas al borde derecho (pedido
                        explícito) — mismo orden de importancia que los tiles
                        de arriba: inicio retrasado → por vencer → final
                        retrasado → bloqueada. */}
                    {/* Mismo estado único que la tarjeta del proyecto (projectStatus). */}
                    {(() => {
                      const { label, tone } = projectStatus(p.health, p.scheduleVarianceDays);
                      return (
                        <span
                          title={p.scheduleVarianceDays !== null ? scheduleVarianceExact(p.scheduleVarianceDays) : undefined}
                          className={`flex flex-shrink-0 items-center gap-1 text-xs font-medium ${HEALTH_TEXT[tone]}`}
                        >
                          <span className={`h-2 w-2 rounded-full ${HEALTH_DOT[tone]}`} />
                          {label}
                        </span>
                      );
                    })()}
                    <div className="ml-auto flex flex-shrink-0 items-center gap-2">
                    {p.lateStartCount > 0 && (
                      <Link
                        href={`/projects/${p.id}?risk=lateStart`}
                        title={`${p.lateStartCount} tarea(s) con inicio retrasado`}
                        className="flex items-center gap-0.5 text-blue-600 hover:underline"
                      >
                        <PlayIcon className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium">{p.lateStartCount}</span>
                      </Link>
                    )}
                    {p.warningCount > 0 && (
                      <Link
                        href={`/projects/${p.id}?risk=warning`}
                        title={`${p.warningCount} tarea(s) por vencer`}
                        className="flex items-center gap-0.5 text-amber-600 hover:underline"
                      >
                        <ClockIcon className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium">{p.warningCount}</span>
                      </Link>
                    )}
                    {p.overdueCount > 0 && (
                      <Link
                        href={`/projects/${p.id}?risk=overdue`}
                        title={`${p.overdueCount} tarea(s) con final retrasado`}
                        className="flex items-center gap-0.5 text-red-600 hover:underline"
                      >
                        <WarningIcon className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium">{p.overdueCount}</span>
                      </Link>
                    )}
                    {p.blockedCount > 0 && (
                      <Link
                        href={`/projects/${p.id}?status=BLOCKED`}
                        title={`${p.blockedCount} tarea(s) bloqueada(s)`}
                        className="flex items-center gap-0.5 text-rose-600 hover:underline"
                      >
                        <LockIcon className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium">{p.blockedCount}</span>
                      </Link>
                    )}
                    </div>
                  </div>
                  ) };
                })}
                />
              </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-start gap-x-5 gap-y-3 text-sm mb-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Buscar</span>
          <SearchBox basePath="/agenda" q={q} hiddenParams={{ projectId, status, userId, risk, type, from, to }} />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Proyecto</span>
          <ComboFilter
            allLabel="Todos los proyectos"
            value={projectId}
            options={projects.map((p) => ({ id: p.id, label: p.name }))}
            paramKey="projectId"
            basePath="/agenda"
            currentParams={{ status, userId, risk, type, q, tag, from, to }}
          />
        </div>

        {canViewOthers && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Persona</span>
            <ComboFilter
              allLabel="Todas las personas"
              value={userId}
              options={users.map((u) => ({ id: u.id, label: u.name }))}
              paramKey="userId"
              basePath="/agenda"
              currentParams={{ projectId, status, risk, type, q, tag, from, to }}
            />
          </div>
        )}

        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Estado</span>
          <ComboFilter
            allLabel="Todos los estados"
            value={status}
            options={(Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map((s) => ({
              id: s,
              label: TASK_STATUS_LABEL[s],
              dotColorClass: TASK_STATUS_COLOR[s].dot,
            }))}
            paramKey="status"
            basePath="/agenda"
            currentParams={{ projectId, userId, risk, type, q, tag, from, to }}
            triggerColorClass={status ? `${TASK_STATUS_COLOR[status].solid} text-white` : undefined}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Tipo</span>
          <ComboFilter
            allLabel="Todos los tipos"
            value={type}
            options={[
              ...(["SIMPLE", "MILESTONE", "QA", "ADJUSTMENT", "ACCEPTANCE"] as const).map((tt) => ({ id: tt, label: TASK_TYPE_LABEL[tt] })),
              ...ATTRIBUTE_TYPE_OPTIONS,
            ]}
            paramKey="type"
            basePath="/agenda"
            currentParams={{ projectId, userId, status, risk, q, tag, from, to }}
            triggerColorClass={attributeTypeTriggerClass(type)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Alerta</span>
          <ComboFilter
            allLabel="Todas las alertas"
            value={risk}
            options={[
              // "Empieza pronto" es preventivo (todavía se puede evitar el
              // atraso) — solo tiene sentido para quien administra, no para
              // un miembro mirando sus propias tareas asignadas.
              ...(canViewOthers ? [{ id: "startingSoon", label: "Empieza pronto", dotColorClass: "bg-cyan-500" }] : []),
              { id: "lateStart", label: "Inicio retrasado", dotColorClass: "bg-blue-400" },
              { id: "warning", label: "Por vencer", dotColorClass: "bg-amber-500" },
              { id: "overdue", label: "Final retrasado", dotColorClass: "bg-red-500" },
            ]}
            paramKey="risk"
            basePath="/agenda"
            currentParams={{ projectId, userId, status, type, q, tag, from, to }}
            triggerColorClass={
              risk === "overdue"
                ? "bg-red-600 text-white"
                : risk === "warning"
                ? "bg-amber-500 text-white"
                : risk === "lateStart"
                ? "bg-blue-500 text-white"
                : risk === "startingSoon"
                ? "bg-cyan-500 text-white"
                : undefined
            }
          />
        </div>

        {agendaTags.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Etiqueta</span>
            <ComboFilter
              allLabel="Todas las etiquetas"
              value={tag}
              options={buildTagFilterOptions(agendaTagCategories, agendaTags)}
              paramKey="tag"
              basePath="/agenda"
              currentParams={{ projectId, userId, status, risk, type, q, from, to }}
            />
          </div>
        )}

        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Fechas</span>
          <DateRangeFilter from={from} to={to} basePath="/agenda" currentParams={{ projectId, userId, status, risk, type, q, tag }} />
        </div>

        {hiddenPref.canToggle && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Proyectos ocultos</span>
            <ShowHiddenProjectsToggle active={hiddenPref.include} />
          </div>
        )}

        <ResetFiltersButton
          count={[projectId, userId, status, risk, type, q, tag, from || to].filter(Boolean).length}
          href="/agenda"
        />
      </div>

      {cards.length === 0 && (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          {viewingOther && canViewOthers
            ? `${users.find((u) => u.id === userId)?.name ?? "Esa persona"} no tiene tareas asignadas con estos filtros.`
            : "No tenés tareas asignadas con estos filtros."}
        </p>
      )}

      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.key}>
            {group.key === "urgent" ? (
              <h2 className="mb-1.5 flex items-center gap-1 px-1 text-xs font-semibold uppercase tracking-wide text-red-600">
                <UrgentIcon className="h-4 w-4" /> Urgentes
              </h2>
            ) : (
              <h2 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{dayHeader(group.cards[0].plannedStart)}</h2>
            )}
            {/* overflow-hidden + radio interno (12px del ul − 1px de borde) en la
                primera/última fila: el color de la fila y el borde de las
                completadas siguen la curva en vez de taparla en cuadrado. */}
            <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {group.cards.map((card) => (
                <li key={card.id} className="group/row">
                  <Link
                    href={`/projects/${card.projectId}/tasks/${card.id}`}
                    className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 group-first/row:rounded-t-[11px] group-last/row:rounded-b-[11px] hover:brightness-95 ${
                      card.isUrgent ? "border-l-4 border-red-600 bg-red-50" : taskCardTint(card.status, card.alert.level)
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                        <ProjectIcon name={card.projectName} iconUrl={card.projectIconUrl} parent={card.projectParent} inline size="h-3.5 w-3.5 text-[7px]" />
                        {card.projectName}
                      </p>
                      <p className={`flex items-center gap-1 font-medium ${card.isUrgent ? "text-red-700" : "text-slate-900"}`}>
                        {card.isUrgent && <UrgentIcon className="h-4 w-4 flex-shrink-0 text-red-600" />}
                        {card.title}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm text-slate-500">
                          {card.plannedStart.slice(0, 10) === card.plannedEnd.slice(0, 10)
                            ? new Date(card.plannedStart).toLocaleDateString("es-CO", DATE_FMT)
                            : `${new Date(card.plannedStart).toLocaleDateString("es-CO", DATE_FMT)} — ${new Date(card.plannedEnd).toLocaleDateString("es-CO", DATE_FMT)}`}
                          {card.alert.level === "onTrack" && ` · vence en ${card.alert.daysRemaining}d`}
                        </p>
                        {card.tags.map((tag) => (
                          <TagChip key={tag.id} colorHex={tag.colorHex} emoji={tag.emoji} categoryName={tag.categoryName} name={tag.name} filter={{ tagId: tag.id, categoryId: tag.categoryId }} />
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      {/* "blocked"/"done" no suman nada al lado del badge de
                          estado (ya dice "Bloqueada"/"Completada") — mismo
                          filtro que ya usa CardBody del tablero. */}
                      {(card.alert.level === "overdue" || card.alert.level === "warning" || card.alert.level === "lateStart") && (
                        <AlertBadge alert={card.alert} />
                      )}
                      {/* Preventivo, solo para quien puede ver la agenda de
                          otras personas (PM/admin) — a un miembro normal
                          mirando la propia no le suma nada. */}
                      {canViewOthers && isStartingSoon(card.alert) && (
                        <span className="inline-flex items-center rounded-md bg-cyan-50 px-1.5 py-0.5 text-[11px] font-medium text-cyan-700">
                          Empieza en {card.alert.daysUntilStart}d
                        </span>
                      )}
                      <TaskIndicators attachmentsCount={card.attachmentsCount} shareToken={card.shareToken} />
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${TASK_STATUS_COLOR[card.status].badge}`}>
                        {TASK_STATUS_LABEL[card.status]}
                      </span>
                      {/* Asignado siempre al final (pedido explícito) —
                          alerta/estado primero, la persona al cierre. */}
                      <AvatarGroup people={card.assignees} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// «Mi rendimiento»: mismas fuentes, alcance y fórmulas que /performance/[userId]
// (su propia página), en versión compacta. Admin: sin los proyectos ocultos
// que no administra, igual que en el detalle.
async function getMyPerformanceSummary(userId: string, admin: Parameters<typeof visibleProjectWhere>[0] | null) {
  const scope = admin ? (await prisma.project.findMany({ where: visibleProjectWhere(admin), select: { id: true } })).map((p) => p.id) : undefined;
  const [overall, recentOnTime, qa, qaRecent, qaFailures, acc, accRecent, accFailures, activity] = await Promise.all([
    getUserPerformance(userId, scope),
    getRecentOnTimeTrend(userId, scope),
    getReviewPerformance("QA", scope),
    getRecentFirstPassTrend(userId, "QA", scope),
    getFailureAnalysisByUser(userId, "QA", scope),
    getReviewPerformance("ACCEPTANCE", scope),
    getRecentFirstPassTrend(userId, "ACCEPTANCE", scope),
    getFailureAnalysisByUser(userId, "ACCEPTANCE", scope),
    getUserActivityStats(userId),
  ]);
  return {
    overall: overall[0],
    recentOnTime,
    qa: { rates: reviewRates(qa.find((r) => r.userId === userId)), recent: qaRecent, topError: qaFailures.byCategory[0]?.category ?? null },
    acceptance: { rates: reviewRates(acc.find((r) => r.userId === userId)), recent: accRecent, topError: accFailures.byCategory[0]?.category ?? null },
    activity,
  };
}

type MyPerformance = NonNullable<Awaited<ReturnType<typeof getMyPerformanceSummary>>>;

const pct = (rate: number) => `${Math.round(rate * 100)}%`;

function MiniStat({ value, label, caption, tone }: { value: string; label: string; caption?: string; tone?: boolean | null }) {
  return (
    // Cada texto en una sola línea (truncate, con el completo en title).
    <div className="min-w-0" title={caption ? `${label} · ${caption}` : label}>
      <p className={`truncate text-xl font-semibold leading-tight ${tone == null ? "text-slate-900" : tone ? "text-emerald-600" : "text-red-600"}`}>{value}</p>
      <p className="truncate text-xs text-slate-500">{label}</p>
      {caption && <p className="truncate text-[11px] text-slate-400">{caption}</p>}
    </div>
  );
}

function StatGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="@container min-w-0 space-y-1.5 border-l border-slate-100 pl-3">
      <p className="text-[11px] font-medium text-slate-400">{title}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 @sm:auto-cols-fr @sm:grid-flow-col @sm:grid-cols-none">{children}</div>
    </div>
  );
}

/** Tendencia de las últimas N contra el histórico: ↑ igual o mejor, ↓ peor (mismo criterio que el detalle). */
function TrendStat({ recent, historic }: { recent: RecentTrend; historic: number | null }) {
  const better = historic === null ? null : Math.round(recent.rate * 100) >= Math.round(historic * 100);
  return (
    <MiniStat
      value={`${better === null ? "" : better ? "↑ " : "↓ "}${pct(recent.rate)}`}
      label={`últimas ${recent.count}`}
      caption={historic === null ? undefined : `Histórico ${pct(historic)}`}
      tone={better}
    />
  );
}

function ReviewGroup({ title, data }: { title: string; data: MyPerformance["qa"] }) {
  if (!data.rates) return null;
  return (
    <StatGroup title={title}>
      <MiniStat
        value={pct(data.rates.firstTry)}
        label="al 1er intento"
        caption={`Meta ${pct(PERFORMANCE_GOALS.firstTryApprovalRate)}`}
        tone={data.rates.firstTry >= PERFORMANCE_GOALS.firstTryApprovalRate}
      />
      <MiniStat value={data.rates.roundsPerTask.toFixed(1)} label="rondas por tarea" caption="Ideal 1.0" />
      {data.recent && <TrendStat recent={data.recent} historic={data.rates.firstTry} />}
      {data.topError && <MiniStat value={data.topError} label="error más común" />}
    </StatGroup>
  );
}

function MyPerformanceStats({ perf }: { perf: MyPerformance }) {
  const { overall, recentOnTime, activity } = perf;
  const completed = overall?.tasksCompleted ?? 0;
  const onTime = overall?.onTimeRate ?? null;
  return (
    // Grupos en dos columnas cuando la TARJETA es ancha (container query, no
    // el ancho de pantalla): en una sola columna quedaba mucho espacio vacío.
    <div className="@container">
    <div className="grid grid-cols-1 gap-x-8 gap-y-4 @xl:grid-cols-2">
      <StatGroup title="General">
        <MiniStat
          value={String(completed)}
          label="completadas"
          caption={`Meta ${PERFORMANCE_GOALS.tasksCompleted}`}
          tone={completed >= PERFORMANCE_GOALS.tasksCompleted}
        />
        <MiniStat
          value={onTime === null ? "—" : pct(onTime)}
          label="a tiempo"
          caption={`Meta ${pct(PERFORMANCE_GOALS.onTimeRate)}`}
          tone={onTime === null ? null : onTime >= PERFORMANCE_GOALS.onTimeRate}
        />
        {recentOnTime && <TrendStat recent={recentOnTime} historic={onTime} />}
      </StatGroup>
      <ReviewGroup title="Pruebas" data={perf.qa} />
      <ReviewGroup title="Aceptaciones" data={perf.acceptance} />
      {activity.activeDays > 0 && (
        <StatGroup title={`Uso de la app · últimos ${activity.periodDays} días`}>
          <MiniStat value={`${activity.activeDays}/${activity.periodDays}`} label="días con uso" />
          <MiniStat value={String(activity.avgPerActiveDay)} label="interacciones/día" caption="en días con uso" />
          <MiniStat value={String(activity.avgPerDay)} label="promedio diario" caption="todo el período" />
        </StatGroup>
      )}
    </div>
    </div>
  );
}
