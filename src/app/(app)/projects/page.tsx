import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTaskAlert, getBottlenecks } from "@/lib/delays";
import { businessDaysRange } from "@/lib/holidays";
import { findScheduleCollisions } from "@/lib/collisions";
import { createProject } from "./actions";
import { Avatar } from "@/components/Avatar";
import { ModalTrigger } from "@/components/Modal";
import { OverlapIcon } from "@/components/icons";
import { ProjectAlertLink } from "../ProjectAlertLink";
import { KanbanBoard, type TaskCard } from "./[id]/KanbanBoard";
import { GanttView, type GanttTask } from "./[id]/GanttView";
import { ProjectCalendarView, type CalendarTask } from "./[id]/ProjectCalendarView";
import { rangeForMode, stepAnchor, utcDate, type CalendarMode } from "@/lib/calendarGrid";
import type { ProjectStatus } from "@prisma/client";

const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  PLANNING: "Planeación",
  ACTIVE: "Activo",
  ON_HOLD: "En pausa",
  COMPLETED: "Completado",
};

// Indicador de salud (punto confirmado con el usuario: % de tareas
// atrasadas) — "cómo voy" de un vistazo, sin tener que leer el detalle.
const HEALTH_LABEL = { ok: "Bien", warn: "Normal", bad: "Muy retrasado" } as const;
const HEALTH_STYLE = {
  ok: "bg-emerald-50 text-emerald-700",
  warn: "bg-amber-50 text-amber-700",
  bad: "bg-red-50 text-red-700",
} as const;

function projectHealth(overdueCount: number, total: number): keyof typeof HEALTH_LABEL {
  if (overdueCount === 0 || total === 0) return "ok";
  return overdueCount / total >= 0.2 ? "bad" : "warn";
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ risk?: "overdue" | "warning"; view?: string; date?: string; mode?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { risk, view, date, mode } = await searchParams;

  // "Superpoderes" del panorama general (confirmado con el usuario): admin
  // ve todo, un PM ve los proyectos que administra, un miembro normal ve
  // solo sus propias tareas asignadas — mismo criterio que ya usa Agenda.
  const isAdmin = session.user.role === "ADMIN";
  const myPmProjectIds = isAdmin
    ? null
    : (await prisma.project.findMany({ where: { pmId: session.user.id }, select: { id: true } })).map((p) => p.id);
  const isPM = Boolean(myPmProjectIds && myPmProjectIds.length > 0);
  const canManageBoard = isAdmin || isPM;
  // Las colisiones de agenda (punto confirmado) solo se muestran a quien
  // administra algo — un miembro normal no las ve, ni aunque sean sus
  // propias tareas.
  const canSeeCollisions = isAdmin || isPM;

  const now = new Date();
  const calendarMode: CalendarMode = mode === "week" || mode === "day" ? mode : "month";
  const [dy, dm, dd] = date ? date.split("-").map(Number) : [];
  const anchor = date ? utcDate(dy, dm - 1, dd) : now;
  const prevAnchor = stepAnchor(calendarMode, anchor, -1);
  const nextAnchor = stepAnchor(calendarMode, anchor, 1);
  const anchorKey = (d: Date) => d.toISOString().slice(0, 10);

  function boardHref(overrides: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      risk,
      view,
      mode: calendarMode !== "month" ? calendarMode : undefined,
      date: anchorKey(anchor),
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
    }
    const qs = p.toString();
    return `/projects${qs ? `?${qs}` : ""}`;
  }

  const [projects, users, allTasksForCollisions] = await Promise.all([
    prisma.project.findMany({
      include: { pm: true, tasks: { select: { id: true, status: true, plannedEnd: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.task.findMany({
      select: {
        id: true,
        projectId: true,
        title: true,
        status: true,
        plannedStart: true,
        plannedEnd: true,
        assignees: { select: { userId: true } },
        project: { select: { name: true } },
      },
    }),
  ]);

  const collisionsById = findScheduleCollisions(
    allTasksForCollisions.map((t) => ({
      id: t.id,
      projectId: t.projectId,
      projectName: t.project.name,
      title: t.title,
      status: t.status,
      plannedStart: t.plannedStart,
      plannedEnd: t.plannedEnd,
      assigneeIds: t.assignees.map((a) => a.userId),
    }))
  );

  const summaries = await Promise.all(
    projects.map(async (p) => {
      const alerts = await Promise.all(p.tasks.map((t) => getTaskAlert(p.countryCode, t)));
      const overdueCount = alerts.filter((a) => a.level === "overdue").length;
      const warningCount = alerts.filter((a) => a.level === "warning").length;
      const bottlenecks = await getBottlenecks(p.id);
      const total = p.tasks.length;
      const completed = p.tasks.filter((t) => t.status === "COMPLETED").length;
      const hasCollision = canSeeCollisions && p.tasks.some((t) => collisionsById.has(t.id));
      return {
        overdueCount,
        warningCount,
        bottlenecks,
        total,
        completed,
        health: projectHealth(overdueCount, total),
        hasCollision,
      };
    })
  );

  const rows = projects
    .map((p, i) => ({ project: p, summary: summaries[i] }))
    .filter(({ summary }) => {
      if (risk === "overdue") return summary.overdueCount > 0;
      if (risk === "warning") return summary.warningCount > 0;
      return true;
    });

  // --- Panorama general: tablero/Gantt/calendario de TODOS los proyectos
  // visibles para este usuario (según sus "superpoderes" de arriba), pensado
  // para detectar de un vistazo actividades que chocan entre proyectos.
  const boardWhere = isAdmin
    ? {}
    : isPM
    ? { projectId: { in: myPmProjectIds! } }
    : { assignees: { some: { userId: session.user.id } } };

  const boardTasksRaw = await prisma.task.findMany({
    where: boardWhere,
    include: {
      project: { select: { id: true, name: true, countryCode: true, startDate: true } },
      phase: { select: { name: true } },
      assignees: { include: { user: true } },
      steps: true,
      attachments: { select: { id: true } },
      dependsOn: {
        include: { predecessor: { select: { id: true, title: true, plannedStart: true, plannedEnd: true } } },
      },
      blocks: { include: { successor: { select: { id: true, title: true } } } },
    },
    orderBy: { plannedStart: "asc" },
  });

  const boardProjectIds = [...new Set(boardTasksRaw.map((t) => t.projectId))];
  const boardBottlenecks = (await Promise.all(boardProjectIds.map((id) => getBottlenecks(id)))).flat();
  const boardBottleneckReasonById = new Map(boardBottlenecks.map((t) => [t.id, t.bottleneckReason]));

  const boardAlertById = new Map(
    await Promise.all(boardTasksRaw.map(async (t) => [t.id, await getTaskAlert(t.project.countryCode, t)] as const))
  );
  const matchesBoardRisk = (taskId: string) => !risk || boardAlertById.get(taskId)!.level === risk;

  const earliestStart =
    boardTasksRaw.length > 0 ? new Date(Math.min(...boardTasksRaw.map((t) => t.project.startDate.getTime()))) : now;
  const latestEnd =
    boardTasksRaw.length > 0 ? new Date(Math.max(...boardTasksRaw.map((t) => t.plannedEnd.getTime()))) : now;
  // ponytail: todos los proyectos usan "CO" hoy (ver PROJECT_COUNTRY_CODE en
  // actions.ts) — si algún día hay proyectos de otro país, esta grilla
  // compartida necesita reconsiderarse.
  const boardBusinessDays = await businessDaysRange("CO", earliestStart, latestEnd);
  const dateKey = (d: Date) => d.toISOString().slice(0, 10);
  const boardBusinessDayIndex = new Map(boardBusinessDays.map((d, i) => [dateKey(d), i]));

  const boardTaskCards: TaskCard[] = boardTasksRaw
    .filter((t) => matchesBoardRisk(t.id))
    .map((t) => ({
      id: t.id,
      projectId: t.projectId,
      projectName: t.project.name,
      title: t.title,
      type: t.type,
      status: t.status,
      riskLevel: t.riskLevel,
      assignees: t.assignees.map((a) => ({ name: a.user.name, avatarUrl: a.user.avatarUrl })),
      assigneeIds: t.assignees.map((a) => a.userId),
      plannedStart: t.plannedStart.toISOString(),
      plannedEnd: t.plannedEnd.toISOString(),
      stepsProgress:
        t.steps.length > 0 ? { done: t.steps.filter((s) => s.done).length, total: t.steps.length } : null,
      attachmentsCount: t.attachments.length,
      alert: boardAlertById.get(t.id)!,
      collidesWith: canSeeCollisions ? collisionsById.get(t.id) ?? null : null,
    }));

  const boardGanttTasks: GanttTask[] = boardTasksRaw
    .filter((t) => matchesBoardRisk(t.id))
    .map((t) => {
      const startIndex = boardBusinessDayIndex.get(dateKey(t.plannedStart)) ?? 0;
      const endIndex = boardBusinessDayIndex.get(dateKey(t.plannedEnd)) ?? startIndex;
      const requiredStartIndices = t.dependsOn.map((d) =>
        d.type === "START_TO_START"
          ? (boardBusinessDayIndex.get(dateKey(d.predecessor.plannedStart)) ?? -1)
          : (boardBusinessDayIndex.get(dateKey(d.predecessor.plannedEnd)) ?? -1) + 1
      );
      const minStartIndex = Math.max(0, ...requiredStartIndices);
      return {
        id: t.id,
        projectId: t.projectId,
        title: t.title,
        phaseName: `${t.project.name} — ${t.phase.name}`,
        status: t.status,
        startIndex,
        span: endIndex - startIndex + 1,
        minStartIndex,
        plannedStart: t.plannedStart.toISOString(),
        plannedEnd: t.plannedEnd.toISOString(),
        dependsOn: t.dependsOn.map((d) =>
          d.type === "START_TO_START" ? `${d.predecessor.title} (en paralelo)` : d.predecessor.title
        ),
        dependsOnLinks: t.dependsOn.map((d) => ({ id: d.predecessorId, type: d.type })),
        blocks: t.blocks.map((d) => d.successor.title),
        attachmentsCount: t.attachments.length,
        alert: boardAlertById.get(t.id)!,
        bottleneckReason: boardBottleneckReasonById.get(t.id) ?? null,
        collidesWith: canSeeCollisions ? collisionsById.get(t.id) ?? null : null,
      };
    });

  const boardCalendarTasks: CalendarTask[] = boardTasksRaw
    .filter((t) => matchesBoardRisk(t.id))
    .map((t) => ({
      id: t.id,
      projectId: t.projectId,
      projectName: t.project.name,
      title: t.title,
      plannedStart: t.plannedStart.toISOString(),
      plannedEnd: t.plannedEnd.toISOString(),
      status: t.status,
      alert: boardAlertById.get(t.id)!,
      collidesWith: canSeeCollisions ? collisionsById.get(t.id) ?? null : null,
    }));

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">Proyectos</h1>
          <ModalTrigger label="+ Nuevo proyecto" title="Nuevo proyecto">
            <form action={createProject} className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm text-slate-600">Nombre</label>
                <input name="name" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-600">Cliente (opcional)</label>
                <input name="clientName" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-600">Inicio</label>
                <input
                  type="date"
                  name="startDate"
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-600">Product Manager</label>
                <select name="pmId" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Crear proyecto
              </button>
            </form>
          </ModalTrigger>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link
            href={boardHref({ risk: undefined })}
            className={`rounded-lg px-3 py-1.5 ${!risk ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            Todos
          </Link>
          <Link
            href={boardHref({ risk: "overdue" })}
            className={`rounded-lg px-3 py-1.5 font-medium ${risk === "overdue" ? "bg-red-600 text-white" : "bg-red-50 text-red-700 hover:brightness-95"}`}
          >
            Con retraso
          </Link>
          <Link
            href={boardHref({ risk: "warning" })}
            className={`rounded-lg px-3 py-1.5 font-medium ${risk === "warning" ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-700 hover:brightness-95"}`}
          >
            Por vencer
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {rows.length === 0 && (
            <p className="text-sm text-slate-500 sm:col-span-2">
              {risk ? "Ningún proyecto tiene tareas con este filtro." : "Todavía no tenés proyectos."}
            </p>
          )}
          {rows.map(({ project: p, summary }) => {
            const { overdueCount, bottlenecks, total, completed, health, hasCollision } = summary;
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="block rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-medium text-slate-900">
                      <span className="truncate">{p.name}</span>
                      {hasCollision && (
                        <span title="Alguna de sus tareas coincide en fechas con otro proyecto (misma persona)">
                          <OverlapIcon className="h-3.5 w-3.5 flex-shrink-0 text-indigo-500" />
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-slate-500">{p.clientName ?? "Interno"}</p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    {health === "ok" ? (
                      <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${HEALTH_STYLE.ok}`}>
                        {HEALTH_LABEL.ok}
                      </span>
                    ) : (
                      <ProjectAlertLink
                        projectId={p.id}
                        risk="overdue"
                        className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium hover:brightness-95 ${HEALTH_STYLE[health]}`}
                      >
                        {HEALTH_LABEL[health]} · {overdueCount} atrasada{overdueCount > 1 ? "s" : ""}
                      </ProjectAlertLink>
                    )}
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                      {PROJECT_STATUS_LABEL[p.status]}
                    </span>
                    <Avatar name={p.pm.name} avatarUrl={p.pm.avatarUrl} size="h-7 w-7 text-[11px]" />
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: total > 0 ? `${Math.round((completed / total) * 100)}%` : "0%" }}
                    />
                  </div>
                  <span className="flex-shrink-0 text-xs text-slate-400">
                    {total > 0 ? Math.round((completed / total) * 100) : 0}% · {completed}/{total} tareas
                  </span>
                </div>
                {bottlenecks.length > 0 && (
                  <p
                    className="mt-1 truncate text-xs text-amber-600"
                    title={bottlenecks.map((b) => `${b.title}: ${b.bottleneckReason}`).join("\n")}
                  >
                    {bottlenecks.length} cuello(s) de botella: {bottlenecks.slice(0, 2).map((b) => b.title).join(", ")}
                    {bottlenecks.length > 2 ? ` +${bottlenecks.length - 2} más` : ""}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Panorama general</h2>
        <p className="text-sm text-slate-500">
          {isAdmin
            ? "Todos los proyectos."
            : isPM
            ? "Los proyectos que administrás."
            : "Tus tareas asignadas en todos los proyectos."}
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="flex gap-2">
            <Link
              href={boardHref({ view: undefined })}
              className={`rounded-lg px-3 py-1.5 ${!view || view === "kanban" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              Tablero
            </Link>
            <Link
              href={boardHref({ view: "gantt" })}
              className={`rounded-lg px-3 py-1.5 ${view === "gantt" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              Gantt
            </Link>
            <Link
              href={boardHref({ view: "calendar" })}
              className={`rounded-lg px-3 py-1.5 ${view === "calendar" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              Calendario
            </Link>
          </div>

          {view === "calendar" && (
            <div className="flex items-center gap-2">
              <Link href={boardHref({ date: anchorKey(prevAnchor) })} className="rounded-lg bg-slate-100 px-3 py-1.5 hover:bg-slate-200">
                ‹
              </Link>
              <span className="min-w-32 text-center font-medium capitalize text-slate-900">
                {calendarMode === "day"
                  ? anchor.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
                  : calendarMode === "week"
                  ? `${rangeForMode("week", anchor).start.toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" })} – ${rangeForMode("week", anchor).end.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`
                  : anchor.toLocaleDateString("es-CO", { month: "long", year: "numeric", timeZone: "UTC" })}
              </span>
              <Link href={boardHref({ date: anchorKey(nextAnchor) })} className="rounded-lg bg-slate-100 px-3 py-1.5 hover:bg-slate-200">
                ›
              </Link>
            </div>
          )}
        </div>

        {view === "calendar" && (
          <div className="flex gap-1 text-sm">
            {(["month", "week", "day"] as const).map((m) => (
              <Link
                key={m}
                href={boardHref({ mode: m === "month" ? undefined : m })}
                className={`rounded-lg px-2.5 py-1 ${calendarMode === m ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
              >
                {m === "month" ? "Mes" : m === "week" ? "Semana" : "Día"}
              </Link>
            ))}
          </div>
        )}

        {view === "gantt" ? (
          <GanttView businessDays={boardBusinessDays} tasks={boardGanttTasks} canManage={canManageBoard} />
        ) : view === "calendar" ? (
          <ProjectCalendarView tasks={boardCalendarTasks} mode={calendarMode} anchor={anchor} showProjectName />
        ) : (
          <KanbanBoard
            key={boardTaskCards.map((t) => `${t.id}:${t.status}`).join(",")}
            initialTasks={boardTaskCards}
            showProjectName
            canManage={canManageBoard}
            users={users}
          />
        )}
      </section>
    </div>
  );
}
