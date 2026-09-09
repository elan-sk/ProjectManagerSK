import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { businessDaysRange } from "@/lib/holidays";
import { getTaskAlert, getBottlenecks } from "@/lib/delays";
import { getProjectAdmin } from "@/lib/permissions";
import { KanbanBoard, type TaskCard } from "./KanbanBoard";
import { GanttView, type GanttTask } from "./GanttView";
import { ProjectCalendarView, type CalendarTask } from "./ProjectCalendarView";
import { DefinitionTab } from "./DefinitionTab";
import { getProjectCascadeProgress } from "@/lib/cascadeProgress";
import { ModalTrigger } from "@/components/Modal";
import { Avatar } from "@/components/Avatar";
import { ProjectHealthBadges, ProjectProgress } from "@/components/ProjectSummary";
import { projectHealth } from "@/lib/projectHealth";
import { ProjectIcon, defaultProjectBgColor } from "@/components/ProjectIcon";
import { NewPhaseForm } from "./NewPhaseForm";
import { NewTaskForm } from "./NewTaskForm";
import { ReassignPMForm } from "./ReassignPMForm";
import { EditStartDateForm } from "./EditStartDateForm";
import { SaveLastProject } from "./SaveLastProject";
import { RememberViewState } from "../../RememberViewState";
import { NavLinkWithMemory } from "../../NavLinkWithMemory";
import { ComboFilter } from "@/components/ComboFilter";
import { SearchBox } from "@/components/SearchBox";
import { matchesTaskSearch } from "@/lib/search";
import { TASK_STATUS_LABEL, TASK_STATUS_COLOR } from "@/lib/statusColors";
import { rangeForMode, stepAnchor, utcDate, type CalendarMode } from "@/lib/calendarGrid";
import type { TaskStatus } from "@prisma/client";

const DATE_FMT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" };

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    view?: string;
    date?: string;
    mode?: string;
    status?: TaskStatus;
    userId?: string;
    risk?: "overdue" | "warning";
    q?: string;
  }>;
}) {
  const { id } = await params;
  const { view, date, mode, status, userId, risk, q } = await searchParams;
  const now = new Date();
  const calendarMode: CalendarMode = mode === "week" || mode === "day" ? mode : "month";
  const [dy, dm, dd] = date ? date.split("-").map(Number) : [];
  const anchor = date ? utcDate(dy, dm - 1, dd) : now;
  const prevAnchor = stepAnchor(calendarMode, anchor, -1);
  const nextAnchor = stepAnchor(calendarMode, anchor, 1);
  const anchorKey = (d: Date) => d.toISOString().slice(0, 10);
  const calendarHref = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ view: "calendar" });
    const merged: Record<string, string | undefined> = {
      mode: calendarMode !== "month" ? calendarMode : undefined,
      date: anchorKey(anchor),
      status,
      userId,
      risk,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `/projects/${id}?${p.toString()}`;
  };
  // Filtros de riesgo/estado (a diferencia de calendarHref, que fuerza
  // view=calendar para la navegación mes/semana/día): estos conservan la
  // vista actual — aplican igual estés en tablero, Gantt o calendario.
  const filterHref = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string | undefined> = { view, mode, date, status, userId, risk, q, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
    }
    const qs = p.toString();
    return `/projects/${id}${qs ? `?${qs}` : ""}`;
  };

  const [project, users, canManage, bottlenecks, cascadeProgress] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        pm: true,
        phases: { orderBy: { order: "asc" } },
        tasks: {
          include: {
            assignees: { include: { user: true } },
            steps: true,
            attachments: { select: { id: true, fileName: true } },
            dependsOn: {
              include: { predecessor: { select: { id: true, title: true, plannedStart: true, plannedEnd: true } } },
            },
            blocks: { include: { successor: { select: { id: true, title: true } } } },
          },
        },
      },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    getProjectAdmin(id).then(Boolean),
    getBottlenecks(id),
    getProjectCascadeProgress(id),
  ]);

  if (!project) notFound();

  // El color del proyecto (o uno automático si no eligió uno) va de fondo de
  // TODA esta vista — punto confirmado con el usuario, para reconocer de un
  // vistazo en qué proyecto estás. Siempre es un color CLARO (paleta acotada
  // en ProjectIcon.tsx), así el texto slate normal es legible sin necesitar
  // calcular contraste.
  const viewColor = project.color ?? defaultProjectBgColor(project.name);

  const bottleneckReasonById = new Map(bottlenecks.map((t) => [t.id, t.bottleneckReason]));

  const alertByTaskId = new Map(
    await Promise.all(
      project.tasks.map(async (t) => [t.id, await getTaskAlert(project.countryCode, t)] as const)
    )
  );
  // Mismo resumen que la card de /projects (salud, progreso, cuellos de
  // botella) — pedido explícito del usuario, sin filtrar por los filtros de
  // la vista (siempre sobre TODAS las tareas del proyecto).
  const summaryOverdueTasks = project.tasks
    .filter((t) => alertByTaskId.get(t.id)!.level === "overdue")
    .map((t) => ({ id: t.id, title: t.title }));
  const summaryWarningTasks = project.tasks
    .filter((t) => alertByTaskId.get(t.id)!.level === "warning")
    .map((t) => ({ id: t.id, title: t.title }));
  const summaryTotal = project.tasks.length;
  const summaryCompleted = project.tasks.filter((t) => t.status === "COMPLETED").length;
  const summaryHealth = projectHealth(summaryOverdueTasks.length, summaryTotal);

  const matchesRisk = (taskId: string) => !risk || alertByTaskId.get(taskId)!.level === risk;
  const matchesFilters = (t: {
    id: string;
    status: string;
    title: string;
    description: string | null;
    assignees: { userId: string }[];
    attachments: { fileName: string }[];
  }) =>
    matchesRisk(t.id) &&
    (!status || t.status === status) &&
    (!userId || t.assignees.some((a) => a.userId === userId)) &&
    matchesTaskSearch(t, q);

  const taskCards: TaskCard[] = project.tasks.filter(matchesFilters).map((t) => ({
    id: t.id,
    projectId: project.id,
    projectName: project.name,
    projectIconUrl: project.iconUrl,
    title: t.title,
    type: t.type,
    status: t.status,
    riskLevel: t.riskLevel,
    assignees: t.assignees.map((a) => ({ name: a.user.name, avatarUrl: a.user.avatarUrl })),
    assigneeIds: t.assignees.map((a) => a.userId),
    plannedStart: t.plannedStart.toISOString(),
    plannedEnd: t.plannedEnd.toISOString(),
    stepsProgress:
      t.steps.length > 0
        ? { done: t.steps.filter((s) => s.done).length, total: t.steps.length }
        : null,
    attachmentsCount: t.attachments.length,
    alert: alertByTaskId.get(t.id)!,
    collidesWith: null,
  }));

  const rangeEnd =
    project.tasks.length > 0
      ? new Date(Math.max(...project.tasks.map((t) => t.plannedEnd.getTime())))
      : project.startDate;
  const businessDays = await businessDaysRange(project.countryCode, project.startDate, rangeEnd);

  const dateKey = (d: Date) => d.toISOString().slice(0, 10);
  const businessDayIndex = new Map(businessDays.map((d, i) => [dateKey(d), i]));

  const ganttTasks: GanttTask[] = project.tasks.filter(matchesFilters).map((t) => {
    const startIndex = businessDayIndex.get(dateKey(t.plannedStart)) ?? 0;
    const endIndex = businessDayIndex.get(dateKey(t.plannedEnd)) ?? startIndex;
    // Punto 6 (arrastre de extremos): el inicio nunca puede quedar antes de
    // lo que exija la predecesora MÁS estricta — "termina antes de que esta
    // empiece" (Finish-to-Start) pide el día hábil siguiente a su fin; "en
    // paralelo" (Start-to-Start, ej. QA continua junto a su Sprint) pide el
    // mismo día que su propio inicio. Tampoco antes del inicio del proyecto.
    const requiredStartIndices = t.dependsOn.map((d) =>
      d.type === "START_TO_START"
        ? (businessDayIndex.get(dateKey(d.predecessor.plannedStart)) ?? -1)
        : (businessDayIndex.get(dateKey(d.predecessor.plannedEnd)) ?? -1) + 1
    );
    const minStartIndex = Math.max(0, ...requiredStartIndices);
    return {
      id: t.id,
      projectId: project.id,
      projectName: project.name,
      projectIconUrl: project.iconUrl,
      title: t.title,
      phaseId: t.phaseId,
      phaseName: project.phases.find((p) => p.id === t.phaseId)?.name ?? "—",
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
      blockedSuccessors: t.blocks.map((d) => ({ id: d.successor.id, title: d.successor.title })),
      attachmentsCount: t.attachments.length,
      alert: alertByTaskId.get(t.id)!,
      bottleneckReason: bottleneckReasonById.get(t.id) ?? null,
      collidesWith: null,
    };
  });

  const calendarTasks: CalendarTask[] = project.tasks
    .filter(matchesFilters)
    .map((t) => ({
      id: t.id,
      projectId: project.id,
      projectName: project.name,
      title: t.title,
      plannedStart: t.plannedStart.toISOString(),
      plannedEnd: t.plannedEnd.toISOString(),
      status: t.status,
      alert: alertByTaskId.get(t.id)!,
      collidesWith: null,
    }));

  return (
    // El color del proyecto va de fondo de TODA la vista, no solo del
    // encabezado — por eso el -m-6/p-6 (cancela el padding de <main> para
    // que el color llegue hasta los bordes) y el alto mínimo (para que
    // cubra hasta el fondo de la pantalla, no solo lo que ocupe el
    // contenido). 57px ≈ alto del header fijo del programa.
    <div
      className="-m-6 min-h-[calc(100vh-57px)] space-y-6 p-6"
      style={{ backgroundColor: `color-mix(in srgb, ${viewColor} 20%, white)` }}
    >
      <SaveLastProject projectId={project.id} />
      <RememberViewState storageKey={`project:${project.id}`} />
      <NavLinkWithMemory href="/projects" storageKey="projectsBoard" className="text-sm text-slate-500 hover:underline">
        ← Todos los proyectos
      </NavLinkWithMemory>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <ProjectIcon name={project.name} iconUrl={project.iconUrl} size="h-12 w-12 text-base" />
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{project.name}</h1>
            <div className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
              <span>
                {project.clientName ?? "Interno"} · Inicio: {project.startDate.toLocaleDateString("es-CO", DATE_FMT)}
              </span>
              {canManage && (
                <ModalTrigger label="Cambiar fecha" title="Editar fecha de inicio" variant="secondary">
                  <EditStartDateForm
                    projectId={project.id}
                    currentStartDate={project.startDate.toISOString().slice(0, 10)}
                  />
                </ModalTrigger>
              )}
            </div>
          </div>
        </div>

        <div className="min-w-[220px] max-w-md flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <ProjectHealthBadges
              projectId={project.id}
              health={summaryHealth}
              overdueCount={summaryOverdueTasks.length}
              overdueTasks={summaryOverdueTasks}
              warningCount={summaryWarningTasks.length}
              warningTasks={summaryWarningTasks}
            />
          </div>
          <ProjectProgress
            projectId={project.id}
            bottlenecks={bottlenecks}
            total={summaryTotal}
            completed={summaryCompleted}
          />
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <Avatar name={project.pm.name} avatarUrl={project.pm.avatarUrl} />
          <div>
            <p className="text-[11px] text-slate-400">Product Manager</p>
            <p className="text-sm font-medium text-slate-900">{project.pm.name}</p>
          </div>
          {canManage && (
            <ModalTrigger label="Cambiar" title="Reasignar Product Manager" variant="secondary">
              <ReassignPMForm projectId={project.id} currentPmId={project.pmId} users={users} />
            </ModalTrigger>
          )}
        </div>
      </div>

      {canManage && (
        <div className="flex gap-2">
          <ModalTrigger label="+ Nueva fase" title="Nueva fase" variant="secondary">
            <NewPhaseForm projectId={project.id} />
          </ModalTrigger>
          <ModalTrigger label="+ Nueva tarea" title="Nueva tarea" variant="primary">
            <NewTaskForm
              projectId={project.id}
              phases={project.phases}
              users={users}
              otherTasks={project.tasks.map((t) => ({ id: t.id, title: t.title }))}
            />
          </ModalTrigger>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex gap-2">
          <Link
            href={filterHref({ view: undefined })}
            className={`rounded-lg px-3 py-1.5 ${!view || view === "kanban" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            Tablero
          </Link>
          <Link
            href={filterHref({ view: "gantt" })}
            className={`rounded-lg px-3 py-1.5 ${view === "gantt" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            Gantt
          </Link>
          <Link
            href={filterHref({ view: "calendar" })}
            className={`rounded-lg px-3 py-1.5 ${view === "calendar" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            Calendario
          </Link>
          <Link
            href={filterHref({ view: "definition" })}
            className={`rounded-lg px-3 py-1.5 ${view === "definition" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            Definición
          </Link>
        </div>

        {view === "calendar" && calendarMode !== "day" && (
          <div className="flex items-center gap-2">
            <Link href={calendarHref({ date: anchorKey(prevAnchor) })} className="rounded-lg bg-slate-100 px-3 py-1.5 hover:bg-slate-200">
              ‹
            </Link>
            <span className="min-w-32 text-center font-medium capitalize text-slate-900">
              {calendarMode === "week"
                ? `${rangeForMode("week", anchor).start.toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" })} – ${rangeForMode("week", anchor).end.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`
                : anchor.toLocaleDateString("es-CO", { month: "long", year: "numeric", timeZone: "UTC" })}
            </span>
            <Link href={calendarHref({ date: anchorKey(nextAnchor) })} className="rounded-lg bg-slate-100 px-3 py-1.5 hover:bg-slate-200">
              ›
            </Link>
          </div>
        )}
      </div>

      {view !== "definition" && (
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3 text-sm">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Buscar</span>
          <SearchBox
            basePath={`/projects/${project.id}`}
            q={q}
            hiddenParams={{ view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), status, userId, risk }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Persona</span>
          <ComboFilter
            allLabel="Todas las personas"
            value={userId}
            options={users.map((u) => ({ id: u.id, label: u.name }))}
            paramKey="userId"
            basePath={`/projects/${project.id}`}
            currentParams={{ view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), status, risk, q }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Estado</span>
          <ComboFilter
            allLabel="Todos los estados"
            value={status}
            options={(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED"] as const).map((s) => ({
              id: s,
              label: TASK_STATUS_LABEL[s],
              dotColorClass: TASK_STATUS_COLOR[s].dot,
            }))}
            paramKey="status"
            basePath={`/projects/${project.id}`}
            currentParams={{ view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), userId, risk, q }}
            triggerColorClass={status ? `${TASK_STATUS_COLOR[status].solid} text-white` : undefined}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Alerta</span>
          <ComboFilter
            allLabel="Todas las alertas"
            value={risk}
            options={[
              { id: "overdue", label: "Con retraso", dotColorClass: "bg-red-500" },
              { id: "warning", label: "Por vencer", dotColorClass: "bg-amber-500" },
            ]}
            paramKey="risk"
            basePath={`/projects/${project.id}`}
            currentParams={{ view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), userId, status, q }}
            triggerColorClass={risk === "overdue" ? "bg-red-600 text-white" : risk === "warning" ? "bg-amber-500 text-white" : undefined}
          />
        </div>
      </div>
      )}

      {view === "calendar" && (
        <div className="flex gap-1 text-sm">
          {(["month", "week", "day"] as const).map((m) => (
            <Link
              key={m}
              href={calendarHref({ mode: m === "month" ? undefined : m })}
              className={`rounded-lg px-2.5 py-1 ${calendarMode === m ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {m === "month" ? "Mes" : m === "week" ? "Semana" : "Día"}
            </Link>
          ))}
        </div>
      )}

      {view === "definition" ? (
        <DefinitionTab
          projectId={project.id}
          name={project.name}
          color={project.color}
          iconUrl={project.iconUrl}
          description={project.description}
          canManage={canManage}
          objectives={cascadeProgress.objectives}
          requirements={cascadeProgress.requirements}
          phases={cascadeProgress.phases}
        />
      ) : view === "gantt" ? (
        <div className="sticky top-[57px] h-[calc(100vh-100px)]">
          <GanttView businessDays={businessDays} tasks={ganttTasks} canManage={canManage} />
        </div>
      ) : view === "calendar" ? (
        <ProjectCalendarView tasks={calendarTasks} mode={calendarMode} anchor={anchor} />
      ) : (
        <div className="sticky top-[57px] h-[calc(100vh-100px)]">
          <KanbanBoard
            key={taskCards.map((t) => `${t.id}:${t.status}`).join(",")}
            initialTasks={taskCards}
            canManage={canManage}
            users={users}
          />
        </div>
      )}
    </div>
  );
}
