import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTaskAlert, getBottlenecks, getTaskScheduleVariance } from "@/lib/delays";
import { getProjectTaskSlack } from "@/lib/criticalPath";
import { businessDaysRange } from "@/lib/holidays";
import { getAppCountryCode } from "@/lib/appSettings";
import { findScheduleCollisions } from "@/lib/collisions";
import { createProject } from "./actions";
import { Avatar } from "@/components/Avatar";
import { ProjectIcon } from "@/components/ProjectIcon";
import { ModalTrigger } from "@/components/Modal";
import { OverlapIcon } from "@/components/icons";
import { ReferencePopover } from "@/components/ReferencePopover";
import { ProjectHealthBadges, ProjectProgress } from "@/components/ProjectSummary";
import { projectHealth } from "@/lib/projectHealth";
import { RememberViewState } from "../RememberViewState";
import { NavLinkWithMemory } from "../NavLinkWithMemory";
import { ProjectCardsOrder } from "./ProjectCardsOrder";
import { ComboFilter } from "@/components/ComboFilter";
import { SearchBox } from "@/components/SearchBox";
import { matchesTaskSearch, normalizeSearchText } from "@/lib/search";
import { TASK_STATUS_LABEL, TASK_STATUS_COLOR, PROJECT_PHASE_LABEL, projectPhase } from "@/lib/statusColors";
import { KanbanBoard, type TaskCard } from "./[id]/KanbanBoard";
import { GanttView, type GanttTask } from "./[id]/GanttView";
import { ProjectCalendarView, type CalendarTask } from "./[id]/ProjectCalendarView";
import { AllProjectsFilesView } from "./AllProjectsFilesView";
import { attachmentFileType } from "@/lib/attachments";
import { rangeForMode, stepAnchor, utcDate, type CalendarMode } from "@/lib/calendarGrid";
import type { TaskStatus } from "@prisma/client";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    risk?: "overdue" | "warning" | "lateStart";
    view?: string;
    date?: string;
    mode?: string;
    status?: TaskStatus;
    userId?: string;
    q?: string;
    collision?: string;
    pq?: string;
    fileKind?: string;
    fileType?: string;
    fileProject?: string;
    fileQ?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { risk, view, date, mode, status, userId, q, collision, pq, fileKind, fileType, fileProject, fileQ } = await searchParams;

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
      status,
      userId,
      q,
      collision,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
    }
    const qs = p.toString();
    return `/projects${qs ? `?${qs}` : ""}`;
  }

  // Filtros propios de la pestaña "Archivos" (insumo/evidencia, tipo,
  // proyecto, buscador) — independientes de los de arriba, que filtran tareas.
  function filesHref(overrides: Record<string, string | undefined>) {
    const p = new URLSearchParams({ view: "files" });
    const merged: Record<string, string | undefined> = { fileKind, fileType, fileProject, fileQ, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
    }
    return `/projects?${p.toString()}`;
  }

  const [projects, users, allTasksForCollisions] = await Promise.all([
    prisma.project.findMany({
      include: {
        pm: true,
        tasks: { select: { id: true, title: true, status: true, plannedStart: true, plannedEnd: true, actualEnd: true } },
      },
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

  const taskSlackByProject = new Map(
    await Promise.all(projects.map(async (p) => [p.id, await getProjectTaskSlack(p.id)] as const))
  );

  const summaries = await Promise.all(
    projects.map(async (p) => {
      const alerts = await Promise.all(p.tasks.map((t) => getTaskAlert(p.countryCode, t)));
      const overdueTasks = p.tasks.filter((_, i) => alerts[i].level === "overdue").map((t) => ({ id: t.id, title: t.title }));
      const warningTasks = p.tasks.filter((_, i) => alerts[i].level === "warning").map((t) => ({ id: t.id, title: t.title }));
      const lateStartTasks = p.tasks.filter((_, i) => alerts[i].level === "lateStart").map((t) => ({ id: t.id, title: t.title }));
      const bottlenecks = await getBottlenecks(p.id);
      const total = p.tasks.length;
      const completed = p.tasks.filter((t) => t.status === "COMPLETED").length;
      const started = p.tasks.some((t) => t.status !== "NOT_STARTED");
      const collisionTasks = canSeeCollisions
        ? p.tasks.filter((t) => collisionsById.has(t.id)).map((t) => ({ id: t.id, title: t.title }))
        : [];
      const openTasks = p.tasks.filter((t) => t.status !== "COMPLETED");
      const openSlackDays =
        openTasks.length > 0
          ? (() => {
              const slack = taskSlackByProject.get(p.id)!;
              const values = openTasks.map((t) => slack.get(t.id)?.slackDays).filter((v): v is number => v != null);
              return values.length > 0 ? Math.min(...values) : null;
            })()
          : null;
      // Holgura/retraso REAL acumulado (plannedEnd vs. actualEnd de tareas ya
      // completadas) — distinto de openSlackDays (margen CPM de las abiertas).
      const completedWithActualEnd = p.tasks.filter((t) => t.status === "COMPLETED" && t.actualEnd);
      const scheduleVarianceDays =
        completedWithActualEnd.length > 0
          ? (
              await Promise.all(completedWithActualEnd.map((t) => getTaskScheduleVariance(p.countryCode, t)))
            ).reduce((sum: number, v) => sum + (v ?? 0), 0)
          : null;
      return {
        overdueCount: overdueTasks.length,
        warningCount: warningTasks.length,
        lateStartCount: lateStartTasks.length,
        overdueTasks,
        warningTasks,
        lateStartTasks,
        bottlenecks,
        total,
        completed,
        health: projectHealth(overdueTasks.length, total),
        phase: projectPhase(total, completed, started),
        collisionTasks,
        openSlackDays,
        scheduleVarianceDays,
      };
    })
  );

  const rows = projects
    .map((p, i) => ({ project: p, summary: summaries[i] }))
    .filter(({ summary }) => {
      if (risk === "overdue") return summary.overdueCount > 0;
      if (risk === "warning") return summary.warningCount > 0;
      if (risk === "lateStart") return summary.lateStartCount > 0;
      return true;
    })
    .filter(({ project: p }) => {
      if (!pq) return true;
      const needle = normalizeSearchText(pq.trim());
      if (!needle) return true;
      return normalizeSearchText(p.name).includes(needle) || normalizeSearchText(p.clientName ?? "").includes(needle);
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
      project: { select: { id: true, name: true, countryCode: true, startDate: true, color: true, iconUrl: true } },
      phase: { select: { name: true } },
      assignees: { include: { user: true } },
      steps: true,
      attachments: { select: { id: true, fileName: true, fileUrl: true, mimeType: true, kind: true } },
      dependsOn: {
        include: {
          predecessor: {
            select: { id: true, title: true, status: true, plannedStart: true, plannedEnd: true, actualEnd: true },
          },
        },
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
  const matchesBoardFilters = (t: {
    id: string;
    status: string;
    title: string;
    description: string | null;
    assignees: { userId: string }[];
    attachments: { fileName: string }[];
  }) =>
    (!risk || boardAlertById.get(t.id)!.level === risk) &&
    (!status || t.status === status) &&
    (!userId || t.assignees.some((a) => a.userId === userId)) &&
    (!collision || Boolean(collisionsById.get(t.id))) &&
    matchesTaskSearch(t, q);

  const earliestStart =
    boardTasksRaw.length > 0 ? new Date(Math.min(...boardTasksRaw.map((t) => t.project.startDate.getTime()))) : now;
  const latestEnd =
    boardTasksRaw.length > 0
      ? new Date(Math.max(...boardTasksRaw.flatMap((t) => [t.plannedEnd.getTime(), t.actualEnd?.getTime() ?? 0])))
      : now;
  // Punto confirmado con el usuario: una tarea ya COMPLETED se dibuja en el
  // Gantt hasta su actualEnd real, no hasta el plannedEnd planeado — el
  // plannedEnd de la DB sigue intacto para los reportes de atraso/holgura.
  const displayEnd = (t: { status: string; plannedEnd: Date; actualEnd: Date | null }) =>
    t.status === "COMPLETED" && t.actualEnd ? t.actualEnd : t.plannedEnd;
  // Margen para poder arrastrar el fin de la última tarea más allá de lo ya
  // planeado (ver mismo comentario en projects/[id]/page.tsx).
  const boardGridEnd = new Date(latestEnd);
  boardGridEnd.setUTCDate(boardGridEnd.getUTCDate() + 30);
  const boardBusinessDays = await businessDaysRange(await getAppCountryCode(), earliestStart, boardGridEnd);
  const dateKey = (d: Date) => d.toISOString().slice(0, 10);
  const boardBusinessDayIndex = new Map(boardBusinessDays.map((d, i) => [dateKey(d), i]));

  const boardTaskCards: TaskCard[] = boardTasksRaw
    .filter(matchesBoardFilters)
    .map((t) => ({
      id: t.id,
      projectId: t.projectId,
      projectName: t.project.name,
      projectIconUrl: t.project.iconUrl,
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
    .filter(matchesBoardFilters)
    .map((t) => {
      const startIndex = boardBusinessDayIndex.get(dateKey(t.plannedStart)) ?? 0;
      const endIndex = boardBusinessDayIndex.get(dateKey(displayEnd(t))) ?? startIndex;
      const requiredStartIndices = t.dependsOn.map((d) =>
        d.type === "START_TO_START"
          ? (boardBusinessDayIndex.get(dateKey(d.predecessor.plannedStart)) ?? -1)
          : (boardBusinessDayIndex.get(dateKey(displayEnd(d.predecessor))) ?? -1) + 1
      );
      const minStartIndex = Math.max(0, ...requiredStartIndices);
      return {
        id: t.id,
        projectId: t.projectId,
        projectName: t.project.name,
        projectIconUrl: t.project.iconUrl,
        title: t.title,
        phaseId: t.phaseId,
        phaseName: t.phase.name,
        status: t.status,
        startIndex,
        span: endIndex - startIndex + 1,
        minStartIndex,
        plannedStart: t.plannedStart.toISOString(),
        plannedEnd: displayEnd(t).toISOString(),
        dependsOn: t.dependsOn.map((d) =>
          d.type === "START_TO_START" ? `${d.predecessor.title} (en paralelo)` : d.predecessor.title
        ),
        dependsOnLinks: t.dependsOn.map((d) => ({ id: d.predecessorId, dependencyId: d.id, type: d.type })),
        blocks: t.blocks.map((d) => d.successor.title),
        blockedSuccessors: t.blocks.map((d) => ({ id: d.successor.id, title: d.successor.title })),
        attachmentsCount: t.attachments.length,
        alert: boardAlertById.get(t.id)!,
        bottleneckReason: boardBottleneckReasonById.get(t.id) ?? null,
        collidesWith: canSeeCollisions ? collisionsById.get(t.id) ?? null : null,
      };
    });

  const boardCalendarTasks: CalendarTask[] = boardTasksRaw
    .filter(matchesBoardFilters)
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

  // Pestaña "Archivos" del panorama general: mismos archivos que ya trae
  // boardTasksRaw (ya acotado por boardWhere a lo que puede ver este
  // usuario — admin todo, PM sus proyectos, miembro solo sus tareas
  // asignadas), solo se agrega el filtro de tipo/proyecto/búsqueda propio
  // de esta vista.
  const boardFileKind: "INSUMO" | "RESULTADO" = fileKind === "RESULTADO" ? "RESULTADO" : "INSUMO";
  const boardFiles = boardTasksRaw
    .flatMap((t) =>
      t.attachments
        .filter((a) => a.kind === boardFileKind)
        .map((a) => ({ ...a, taskId: t.id, taskTitle: t.title, projectId: t.projectId, projectName: t.project.name }))
    )
    .filter((a) => !fileType || fileType === "all" || attachmentFileType(a.mimeType) === fileType)
    .filter((a) => !fileProject || a.projectId === fileProject)
    .filter((a) => !fileQ || normalizeSearchText(a.fileName).includes(normalizeSearchText(fileQ)));
  const boardFileProjectOptions = Array.from(new Map(boardTasksRaw.map((t) => [t.projectId, t.project.name])).entries()).map(
    ([id, label]) => ({ id, label })
  );

  return (
    <div className="space-y-8">
      <RememberViewState storageKey="projectsBoard" />
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

        <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Buscar</span>
            <SearchBox basePath="/projects" q={pq} paramName="pq" placeholder="Buscar proyectos…" hiddenParams={{ risk }} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Alerta</span>
            <ComboFilter
              allLabel="Todos los proyectos"
              value={risk}
              options={[
                { id: "lateStart", label: "Inicio retrasado", dotColorClass: "bg-blue-400" },
                { id: "warning", label: "Por vencer", dotColorClass: "bg-amber-500" },
                { id: "overdue", label: "Final retrasado", dotColorClass: "bg-red-500" },
              ]}
              paramKey="risk"
              basePath="/projects"
              currentParams={{ pq }}
              triggerColorClass={risk === "overdue" ? "bg-red-600 text-white" : risk === "warning" ? "bg-amber-500 text-white" : risk === "lateStart" ? "bg-blue-500 text-white" : undefined}
            />
          </div>
          {(pq || risk) && (
            <Link
              href={boardHref({ risk: undefined })}
              className="self-end text-xs font-medium text-slate-500 hover:text-slate-900 hover:underline"
            >
              Ver todos los proyectos
            </Link>
          )}
        </div>

        <div className="grid max-h-110 grid-cols-1 gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
          {rows.length === 0 && (
            <p className="text-sm text-slate-500 sm:col-span-2">
              {pq
                ? "Ningún proyecto coincide con la búsqueda."
                : risk
                ? "Ningún proyecto tiene tareas con este filtro."
                : "Todavía no tenés proyectos."}
            </p>
          )}
          <ProjectCardsOrder
            items={rows.map(({ project: p, summary }) => {
            const { overdueCount, warningCount, lateStartCount, overdueTasks, warningTasks, lateStartTasks, bottlenecks, total, completed, health, phase, collisionTasks, openSlackDays, scheduleVarianceDays } = summary;
            return { id: p.id, node: (
              <NavLinkWithMemory
                href={`/projects/${p.id}`}
                storageKey={`project:${p.id}`}
                className="block h-full rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <ProjectIcon name={p.name} iconUrl={p.iconUrl} size="h-12 w-12 text-base" />
                    <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-medium text-slate-900">
                      <span className="truncate">{p.name}</span>
                      {collisionTasks.length > 0 && (
                        <ReferencePopover
                          trigger={<OverlapIcon className="h-3.5 w-3.5 flex-shrink-0 text-indigo-500" />}
                          hoverText="Alguna de sus tareas coincide en fechas con otro proyecto (misma persona)"
                          items={collisionTasks.map((t) => ({ id: t.id, label: t.title, href: `/projects/${p.id}/tasks/${t.id}` }))}
                          filteredHref="/projects?collision=1"
                          filteredLabel="Ver todas las colisiones"
                        />
                      )}
                    </p>
                    <p className="text-sm text-slate-500">{p.clientName ?? "Interno"}</p>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <ProjectHealthBadges
                      projectId={p.id}
                      health={health}
                      overdueCount={overdueCount}
                      overdueTasks={overdueTasks}
                      warningCount={warningCount}
                      warningTasks={warningTasks}
                      lateStartCount={lateStartCount}
                      lateStartTasks={lateStartTasks}
                      openSlackDays={openSlackDays}
                      scheduleVarianceDays={scheduleVarianceDays}
                    />
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                      {PROJECT_PHASE_LABEL[phase]}
                    </span>
                    <Avatar name={p.pm.name} avatarUrl={p.pm.avatarUrl} size="h-7 w-7 text-[11px]" />
                  </div>
                </div>

                <div className="mt-2">
                  <ProjectProgress projectId={p.id} bottlenecks={bottlenecks} total={total} completed={completed} />
                </div>
              </NavLinkWithMemory>
            ) };
            })}
          />
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
            <Link
              href={filesHref({})}
              className={`rounded-lg px-3 py-1.5 ${view === "files" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              Archivos
            </Link>
          </div>

          {view === "calendar" && calendarMode !== "day" && (
            <div className="flex items-center gap-2">
              <Link href={boardHref({ date: anchorKey(prevAnchor) })} className="rounded-lg bg-slate-100 px-3 py-1.5 hover:bg-slate-200">
                ‹
              </Link>
              <span className="min-w-32 text-center font-medium capitalize text-slate-900">
                {calendarMode === "week"
                  ? `${rangeForMode("week", anchor).start.toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" })} – ${rangeForMode("week", anchor).end.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`
                  : anchor.toLocaleDateString("es-CO", { month: "long", year: "numeric", timeZone: "UTC" })}
              </span>
              <Link href={boardHref({ date: anchorKey(nextAnchor) })} className="rounded-lg bg-slate-100 px-3 py-1.5 hover:bg-slate-200">
                ›
              </Link>
            </div>
          )}
        </div>

        {view !== "files" && (
          <div className="flex flex-wrap items-start gap-x-5 gap-y-3 text-sm">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">Buscar</span>
              <SearchBox
                basePath="/projects"
                q={q}
                hiddenParams={{ risk, view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), status, userId, collision }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">Persona</span>
              <ComboFilter
                allLabel="Todas las personas"
                value={userId}
                options={users.map((u) => ({ id: u.id, label: u.name }))}
                paramKey="userId"
                basePath="/projects"
                currentParams={{ risk, view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), status, q, collision }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">Estado</span>
              <ComboFilter
                allLabel="Todos los estados"
                value={status}
                options={(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "RETURNED", "COMPLETED"] as const).map((s) => ({
                  id: s,
                  label: TASK_STATUS_LABEL[s],
                  dotColorClass: TASK_STATUS_COLOR[s].dot,
                }))}
                paramKey="status"
                basePath="/projects"
                currentParams={{ risk, view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), userId, q, collision }}
                triggerColorClass={status ? `${TASK_STATUS_COLOR[status].solid} text-white` : undefined}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">Alerta</span>
              <ComboFilter
                allLabel="Todas las alertas"
                value={risk}
                options={[
                  { id: "lateStart", label: "Inicio retrasado", dotColorClass: "bg-blue-400" },
                  { id: "warning", label: "Por vencer", dotColorClass: "bg-amber-500" },
                  { id: "overdue", label: "Final retrasado", dotColorClass: "bg-red-500" },
                ]}
                paramKey="risk"
                basePath="/projects"
                currentParams={{ view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), userId, status, q, collision }}
                triggerColorClass={risk === "overdue" ? "bg-red-600 text-white" : risk === "warning" ? "bg-amber-500 text-white" : risk === "lateStart" ? "bg-blue-500 text-white" : undefined}
              />
            </div>
            {canSeeCollisions && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Colisión</span>
                <Link
                  href={boardHref({ collision: collision ? undefined : "1" })}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${collision ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  <OverlapIcon className="h-3.5 w-3.5" />
                  Solo colisiones
                </Link>
              </div>
            )}
          </div>
        )}

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

        {view === "files" ? (
          <AllProjectsFilesView
            files={boardFiles}
            projects={boardFileProjectOptions}
            fileKind={boardFileKind}
            fileType={fileType}
            fileProject={fileProject}
            fileQ={fileQ}
            filesHref={filesHref}
          />
        ) : view === "gantt" ? (
          // Sticky en vez de flex-col como en projects/[id]/page.tsx: acá,
          // antes del Gantt, va la sección completa de tarjetas de proyecto
          // (crece libre con la página, no se comprime). Al bajar el scroll
          // hasta acá, el Gantt se pega debajo del header (57px) y ocupa el
          // resto de la pantalla con su propio scroll interno.
          <div className="sticky top-[57px] h-[calc(100vh-57px-16px)]">
            <GanttView businessDays={boardBusinessDays} tasks={boardGanttTasks} canManage={canManageBoard} users={users} />
          </div>
        ) : view === "calendar" ? (
          <ProjectCalendarView tasks={boardCalendarTasks} mode={calendarMode} anchor={anchor} showProjectName />
        ) : (
          <div className="sticky top-[57px] h-[calc(100vh-100px)]">
            <KanbanBoard
              key={boardTaskCards.map((t) => `${t.id}:${t.status}`).join(",")}
              initialTasks={boardTaskCards}
              showProjectName
              canManage={canManageBoard}
              users={users}
            />
          </div>
        )}
      </section>
    </div>
  );
}
