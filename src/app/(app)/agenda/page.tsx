import { auth } from "@/auth";
import { AlertBadge } from "@/components/AlertBadge";
import { AvatarGroup } from "@/components/Avatar";
import { ComboFilter } from "@/components/ComboFilter";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { ResetFiltersButton } from "@/components/ResetFiltersButton";
import { matchesDateRange, parseDayKey } from "@/lib/dateRange";
import { ATTRIBUTE_TYPE_OPTIONS, attributeTypeTriggerClass, hasUploadedFiles, isAttributeType, matchesAttributeType } from "@/lib/taskTypeFilter";
import { ClockIcon, LockIcon, PlayIcon, UrgentIcon, WarningIcon } from "@/components/icons";
import { ProjectIcon } from "@/components/ProjectIcon";
import { SearchBox } from "@/components/SearchBox";
import { TagChip } from "@/components/TagChip";
import { getAgendaCounts, getPmProjectsSummary } from "@/lib/agendaSummary";
import { getTaskAlert, getUserPerformance, matchesRiskFilter, type TaskAlert } from "@/lib/delays";
import { prisma } from "@/lib/prisma";
import { getReviewPerformance } from "@/lib/reviewPerformance";
import { matchesTaskSearch } from "@/lib/search";
import { HEALTH_LABEL } from "@/lib/projectHealth";
import { TASK_STATUS_COLOR, TASK_STATUS_LABEL, TASK_TYPE_LABEL, taskCardTint, isStartingSoon } from "@/lib/statusColors";
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
  title: string;
  isUrgent: boolean;
  status: TaskStatus;
  tags: { id: string; name: string; colorHex: string; emoji: string | null }[];
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
  key: keyof Awaited<ReturnType<typeof getAgendaCounts>>;
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
  }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { projectId, status, userId, risk, type, q, from: fromParam, to: toParam } = await searchParams;
  const from = parseDayKey(fromParam);
  const to = parseDayKey(toParam);

  // Ver la agenda de otra persona es un privilegio de PM/admin: un miembro
  // normal solo puede ver sus propias tareas, sin importar qué userId venga
  // en la URL. Un PM además queda acotado a los proyectos que administra —
  // no a cualquier proyecto de la app.
  const isAdmin = session.user.role === "ADMIN";
  const pmProjectIds = isAdmin
    ? null
    : (await prisma.project.findMany({ where: { pmId: session.user.id }, select: { id: true } })).map((p) => p.id);
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

  const [tasksRaw, projects, users, counts, pmSummary, myPerformance, myReviewPerf] = await Promise.all([
    prisma.task.findMany({
      where: {
        assignees: { some: { userId: effectiveUserId } },
        projectId: scopedProjectIds ? { in: scopedProjectIds } : projectId || undefined,
        status: status || undefined,
        archivedAt: null,
        ...(isAdmin ? {} : { project: { hidden: false } }),
      },
      include: {
        project: true,
        assignees: { include: { user: true } },
        taskTags: { include: { tag: { include: { category: true } } } },
        attachments: { select: { fileName: true, mimeType: true } },
      },
      orderBy: { plannedStart: "asc" },
    }),
    prisma.project.findMany({
      where: { tasks: { some: { assignees: { some: { userId: session.user.id } } } }, ...(isAdmin ? {} : { hidden: false }) },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // Los tiles del dashboard siempre resumen el TOTAL de la persona, sin
    // importar los filtros activos de la lista de abajo (mismo criterio que
    // el resumen de salud de /projects/[id]).
    getAgendaCounts(effectiveUserId),
    // "Mis proyectos"/"Mi rendimiento" — solo tienen sentido en tu propia
    // agenda, nunca mirando la de otra persona.
    viewingOther ? Promise.resolve([]) : getPmProjectsSummary(session.user.id),
    viewingOther ? Promise.resolve([]) : getUserPerformance(session.user.id),
    // Resumen de pruebas entregadas (si el usuario nunca entrega nada a QA,
    // roundsSubmitted queda en 0 y no se muestra ese dato extra) — Aceptación
    // queda afuera de este resumen rápido, tiene su propio bloque en
    // /performance.
    viewingOther ? Promise.resolve([]) : getReviewPerformance("QA"),
  ]);

  // Solo se consulta si el filtro lo pide: tareas con un link de compartir activo.
  const sharedTaskIds =
    type === "SHARED"
      ? new Set(
          (
            await prisma.shareLink.findMany({
              where: { targetType: "TASK", revokedAt: null, taskId: { in: tasksRaw.map((t) => t.id) } },
              select: { taskId: true },
            })
          ).map((l) => l.taskId)
        )
      : new Set<string | null>();

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
    .filter((t) => matchesTaskSearch(t, q));

  const cards: AgendaCard[] = tasks.map((t) => ({
    id: t.id,
    projectId: t.projectId,
    projectName: t.project.name,
    projectIconUrl: t.project.iconUrl,
    title: t.title,
    isUrgent: t.isUrgent && t.status !== "COMPLETED",
    status: t.status,
    tags: t.taskTags.map((tt) => ({ id: tt.tagId, name: tt.tag.name, colorHex: tt.tag.category.colorHex, emoji: tt.tag.category.emoji })),
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

  const perf = myPerformance[0];
  const onTimePct = perf?.onTimeRate != null ? `${Math.round(perf.onTimeRate * 100)}%` : "—";
  const reviewPerf = myReviewPerf.find((r) => r.userId === session.user.id);
  const firstPassPct =
    reviewPerf && reviewPerf.roundsSubmitted > 0 ? `${Math.round((reviewPerf.roundsApprovedFirstTry / reviewPerf.roundsSubmitted) * 100)}%` : null;

  function agendaHref(overrides: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    const merged: Record<string, string | undefined> = { projectId, status, userId, risk, type, q, from, to, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `/agenda?${p.toString()}`;
  }

  // Los indicadores superiores son accesos directos, no filtros que se
  // acumulen: al elegir uno se empieza desde una Agenda limpia y queda una
  // única condición activa. Si se pulsa el que ya estaba activo, se vuelve a
  // la Agenda sin filtros.
  function tileHref(tile: (typeof TILES)[number], active: boolean) {
    if (active) return "/agenda";
    const p = new URLSearchParams();
    for (const [key, value] of Object.entries(tile.overrides(false))) {
      if (value) p.set(key, value);
    }
    return `/agenda?${p.toString()}`;
  }

  return (
    <div className="space-y-4">
      <RememberViewState storageKey="lastAgendaView" />
      <h1 className="text-2xl font-semibold text-slate-900">Agenda</h1>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {TILES.map((tile) => {
          const active = tile.isActive({ status, risk, type });
          return (
            <Link
              key={tile.key}
              href={tileHref(tile, active)}
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
          <div className="rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-slate-400">Mi rendimiento</p>
              <Link href={`/performance/${session.user.id}`} className="text-xs text-slate-400 hover:text-slate-700">
                Ver detalle →
              </Link>
            </div>
            <div className="flex flex-wrap gap-5">
              <div>
                <p className="text-xl font-semibold text-slate-900">{perf?.tasksCompleted ?? 0}</p>
                <p className="text-xs text-slate-500">completadas</p>
              </div>
              <div>
                <p
                  className={`text-xl font-semibold ${
                    perf?.onTimeRate == null ? "text-slate-900" : perf.onTimeRate >= 0.7 ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {onTimePct}
                </p>
                <p className="text-xs text-slate-500">a tiempo</p>
              </div>
              {/* Solo si alguna vez entregó algo a revisión QA — la mayoría de
                  los usuarios no, así que "completadas/a tiempo" solos no
                  siempre alcanzan para saber cómo le va. */}
              {firstPassPct && (
                <div>
                  <p className={`text-xl font-semibold ${reviewPerf!.roundsApprovedFirstTry / reviewPerf!.roundsSubmitted >= 0.7 ? "text-emerald-600" : "text-amber-600"}`}>
                    {firstPassPct}
                  </p>
                  <p className="text-xs text-slate-500">aprobadas a la primera</p>
                </div>
              )}
            </div>
          </div>

          {pmSummary.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
              <p className="mb-2 text-xs font-medium text-slate-400">Mis proyectos</p>
              {/* Alto/ancho explícitos en las dos direcciones (nunca uno solo
                  implícito) — ~3 proyectos visibles, el resto con scroll. */}
              <div className="max-h-[130px] space-y-1 overflow-y-auto overflow-x-hidden pr-1">
                {pmSummary.map((p) => {
                  const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
                  return (
                  <div key={p.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-50">
                    <Link href={`/projects/${p.id}`} className="flex flex-shrink-0 items-center gap-1.5">
                      <ProjectIcon name={p.name} iconUrl={p.iconUrl} size="h-5 w-5 text-[9px]" />
                      {/* Ancho máximo fijo: un nombre largo no debe empujar el
                          resto de la fila ni romper el layout. */}
                      <span className="max-w-[110px] truncate text-sm font-medium text-slate-800">{p.name}</span>
                    </Link>
                    <div className="flex flex-shrink-0 items-center gap-1.5">
                      <div className="h-1.5 w-16 flex-shrink-0 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
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
                    <span className={`flex flex-shrink-0 items-center gap-1 text-xs font-medium ${HEALTH_TEXT[p.health]}`}>
                      <span className={`h-2 w-2 rounded-full ${HEALTH_DOT[p.health]}`} />
                      {HEALTH_LABEL[p.health]}
                    </span>
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
                  );
                })}
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
            currentParams={{ status, userId, risk, type, q, from, to }}
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
              currentParams={{ projectId, status, risk, type, q, from, to }}
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
            currentParams={{ projectId, userId, risk, type, q, from, to }}
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
            currentParams={{ projectId, userId, status, risk, q, from, to }}
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
            currentParams={{ projectId, userId, status, type, q, from, to }}
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

        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Fechas</span>
          <DateRangeFilter from={from} to={to} basePath="/agenda" currentParams={{ projectId, userId, status, risk, type, q }} />
        </div>

        <ResetFiltersButton
          count={[projectId, userId, status, risk, type, q, from || to].filter(Boolean).length}
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
            <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
              {group.cards.map((card) => (
                <li key={card.id}>
                  <Link
                    href={`/projects/${card.projectId}/tasks/${card.id}`}
                    className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:brightness-95 ${
                      card.isUrgent ? "border-l-4 border-red-600 bg-red-50" : taskCardTint(card.status, card.alert.level)
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                        <ProjectIcon name={card.projectName} iconUrl={card.projectIconUrl} size="h-3.5 w-3.5 text-[7px]" />
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
                          <TagChip key={tag.id} colorHex={tag.colorHex} emoji={tag.emoji} name={tag.name} />
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
