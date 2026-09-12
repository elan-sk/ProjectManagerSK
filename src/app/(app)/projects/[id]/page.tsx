import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { businessDaysRange, addBusinessDays } from "@/lib/holidays";
import { getTaskAlert, getBottlenecks } from "@/lib/delays";
import { getProjectAdmin } from "@/lib/permissions";
import { KanbanBoard, type TaskCard } from "./KanbanBoard";
import { GanttView, type GanttTask } from "./GanttView";
import { CriticalPathButton } from "./CriticalPathButton";
import { ProjectCalendarView, type CalendarTask } from "./ProjectCalendarView";
import { DefinitionTab } from "./DefinitionTab";
import { getProjectCascadeProgress } from "@/lib/cascadeProgress";
import { ModalTrigger } from "@/components/Modal";
import { Avatar } from "@/components/Avatar";
import { ProjectHealthBadges, ProjectProgress } from "@/components/ProjectSummary";
import { projectHealth } from "@/lib/projectHealth";
import { ProjectIcon } from "@/components/ProjectIcon";
import { NewTaskForm } from "./NewTaskForm";
import { ReassignPMForm } from "./ReassignPMForm";
import { EditStartDateForm } from "./EditStartDateForm";
import { EditTargetEndDateForm } from "./EditTargetEndDateForm";
import { EditRepoUrlForm } from "./EditRepoUrlForm";
import { SaveLastProject } from "./SaveLastProject";
import { RememberViewState } from "../../RememberViewState";
import { NavLinkWithMemory } from "../../NavLinkWithMemory";
import { ComboFilter } from "@/components/ComboFilter";
import { SearchBox } from "@/components/SearchBox";
import { matchesTaskSearch, normalizeSearchText } from "@/lib/search";
import { attachmentFileType } from "@/lib/attachments";
import { ProjectFilesView } from "./ProjectFilesView";
import { getActiveShareLink } from "@/lib/shareLinks";
import { createProjectShareLink, revokeProjectShareLink } from "../../shareActions";
import { ShareLinkPanel } from "@/components/ShareLinkPanel";
import { TASK_STATUS_LABEL, TASK_STATUS_COLOR, TASK_TYPE_LABEL } from "@/lib/statusColors";
import { rangeForMode, stepAnchor, utcDate, type CalendarMode } from "@/lib/calendarGrid";
import type { TaskStatus, TaskType } from "@prisma/client";

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
    type?: TaskType;
    userId?: string;
    risk?: "overdue" | "warning" | "lateStart";
    q?: string;
    fileKind?: string;
    fileType?: string;
    fileTask?: string;
    fileQ?: string;
  }>;
}) {
  const { id } = await params;
  const { view, date, mode, status, type, userId, risk, q, fileKind, fileType, fileTask, fileQ } = await searchParams;
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
      type,
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
    const merged: Record<string, string | undefined> = { view, mode, date, status, type, userId, risk, q, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
    }
    const qs = p.toString();
    return `/projects/${id}${qs ? `?${qs}` : ""}`;
  };
  // Filtros propios de la pestaña "Archivos" (insumo/evidencia, tipo,
  // tarea, buscador) — independientes de los de arriba, que filtran tareas.
  const filesHref = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ view: "files" });
    const merged: Record<string, string | undefined> = { fileKind, fileType, fileTask, fileQ, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
    }
    return `/projects/${id}?${p.toString()}`;
  };

  const [project, users, canManage, bottlenecks, cascadeProgress, activeShareLink] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        pm: true,
        phases: { orderBy: { order: "asc" } },
        links: { orderBy: { createdAt: "asc" } },
        attachments: { orderBy: { uploadedAt: "asc" } },
        tasks: {
          include: {
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
        },
      },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    getProjectAdmin(id).then(Boolean),
    getBottlenecks(id),
    getProjectCascadeProgress(id),
    getActiveShareLink("PROJECT", id),
  ]);

  if (!project) notFound();

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
  const summaryLateStartTasks = project.tasks
    .filter((t) => alertByTaskId.get(t.id)!.level === "lateStart")
    .map((t) => ({ id: t.id, title: t.title }));
  const summaryTotal = project.tasks.length;
  const summaryCompleted = project.tasks.filter((t) => t.status === "COMPLETED").length;
  const summaryHealth = projectHealth(summaryOverdueTasks.length, summaryTotal);
  const phaseSlackValues = cascadeProgress.phases.map((p) => p.openSlackDays).filter((v): v is number => v !== null);
  const summaryOpenSlackDays = phaseSlackValues.length > 0 ? Math.min(...phaseSlackValues) : null;
  const phaseVarianceValues = cascadeProgress.phases
    .map((p) => p.scheduleVarianceDays)
    .filter((v): v is number => v !== null);
  const summaryScheduleVarianceDays = phaseVarianceValues.length > 0 ? phaseVarianceValues.reduce((s, v) => s + v, 0) : null;

  const matchesRisk = (taskId: string) => !risk || alertByTaskId.get(taskId)!.level === risk;
  const matchesFilters = (t: {
    id: string;
    status: string;
    type: string;
    title: string;
    description: string | null;
    assignees: { userId: string }[];
    attachments: { fileName: string }[];
  }) =>
    matchesRisk(t.id) &&
    (!status || t.status === status) &&
    (!type || t.type === type) &&
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
      ? new Date(Math.max(...project.tasks.flatMap((t) => [t.plannedEnd.getTime(), t.actualEnd?.getTime() ?? 0])))
      : project.startDate;
  // Margen para poder arrastrar el fin de la última tarea del proyecto más
  // allá de lo ya planeado (bug real: sin esto, businessDays terminaba
  // justo en su plannedEnd y el handle de la derecha quedaba clampeado en
  // el mismo lugar — no había ninguna columna futura a la que arrastrar). Si
  // el deadline del proyecto cae más lejos que eso, la grilla también debe
  // alcanzar para poder dibujar esa línea.
  const gridEnd = new Date(Math.max(rangeEnd.getTime(), project.targetEndDate?.getTime() ?? 0));
  gridEnd.setUTCDate(gridEnd.getUTCDate() + 30);
  const businessDays = await businessDaysRange(project.countryCode, project.startDate, gridEnd);

  const dateKey = (d: Date) => d.toISOString().slice(0, 10);
  const businessDayIndex = new Map(businessDays.map((d, i) => [dateKey(d), i]));

  // Punto confirmado con el usuario: una tarea ya COMPLETED se dibuja hasta
  // su actualEnd real, no hasta el plannedEnd planeado — la barra debe
  // reflejar cuándo terminó de verdad. El plannedEnd de la DB sigue intacto
  // (getTaskDelayDays/getTaskEarlyDays/reportes lo siguen usando tal cual);
  // esto es solo la fecha que se grafica.
  const displayEnd = (t: { status: string; plannedEnd: Date; actualEnd: Date | null }) =>
    t.status === "COMPLETED" && t.actualEnd ? t.actualEnd : t.plannedEnd;

  // Sugerencia de fecha de inicio para "Nueva tarea" al elegir "Depende de":
  // el día hábil siguiente al fin real de esa tarea (mismo criterio que
  // requiredStartFor en actions.ts) — el usuario puede seguir ajustándola.
  const nextAvailableStartById = new Map(
    await Promise.all(
      project.tasks.map(
        async (t) => [t.id, (await addBusinessDays(project.countryCode, displayEnd(t), 1)).toISOString()] as const
      )
    )
  );

  const ganttTasks: GanttTask[] = project.tasks.filter(matchesFilters).map((t) => {
    const startIndex = businessDayIndex.get(dateKey(t.plannedStart)) ?? 0;
    const endIndex = businessDayIndex.get(dateKey(displayEnd(t))) ?? startIndex;
    // Punto 6 (arrastre de extremos): el inicio nunca puede quedar antes de
    // lo que exija la predecesora MÁS estricta — "termina antes de que esta
    // empiece" (Finish-to-Start) pide el día hábil siguiente a su fin; "en
    // paralelo" (Start-to-Start, ej. QA continua junto a su Sprint) pide el
    // mismo día que su propio inicio. Tampoco antes del inicio del proyecto.
    const requiredStartIndices = t.dependsOn.map((d) =>
      d.type === "START_TO_START"
        ? (businessDayIndex.get(dateKey(d.predecessor.plannedStart)) ?? -1)
        : (businessDayIndex.get(dateKey(displayEnd(d.predecessor))) ?? -1) + 1
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
      plannedEnd: displayEnd(t).toISOString(),
      dependsOn: t.dependsOn.map((d) =>
        d.type === "START_TO_START" ? `${d.predecessor.title} (en paralelo)` : d.predecessor.title
      ),
      dependsOnLinks: t.dependsOn.map((d) => ({ id: d.predecessorId, dependencyId: d.id, type: d.type })),
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

  const projectFileKind: "INSUMO" | "RESULTADO" = fileKind === "RESULTADO" ? "RESULTADO" : "INSUMO";
  // Los archivos subidos directo al repositorio del proyecto (no atados a
  // ninguna tarea) cuentan como insumo del proyecto en este filtro.
  const projectRepoFiles: { id: string; fileUrl: string; fileName: string; mimeType: string; taskId: string | null; taskTitle: string | null }[] =
    projectFileKind === "INSUMO"
      ? project.attachments.map((a) => ({ ...a, taskId: null, taskTitle: null }))
      : [];
  const projectFiles = project.tasks
    .flatMap((t) =>
      t.attachments
        .filter((a) => a.kind === projectFileKind)
        .map((a) => ({ id: a.id, fileUrl: a.fileUrl, fileName: a.fileName, mimeType: a.mimeType, taskId: t.id as string | null, taskTitle: t.title as string | null }))
    )
    .concat(projectRepoFiles)
    .filter((a) => !fileType || fileType === "all" || attachmentFileType(a.mimeType) === fileType)
    .filter((a) => !fileTask || a.taskId === fileTask)
    .filter((a) => !fileQ || normalizeSearchText(a.fileName).includes(normalizeSearchText(fileQ)));

  return (
    <div className="space-y-6">
      <SaveLastProject projectId={project.id} />
      <RememberViewState storageKey={`project:${project.id}`} />
      <NavLinkWithMemory href="/projects" storageKey="projectsBoard" className="text-sm text-slate-500 hover:underline">
        ← Todos los proyectos
      </NavLinkWithMemory>
      <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <ProjectIcon name={project.name} iconUrl={project.iconUrl} size="h-12 w-12 text-base" />
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{project.name}</h1>
            <div className="text-sm text-slate-500">
              {project.clientName ?? "Interno"} · Inicio: {project.startDate.toLocaleDateString("es-CO", DATE_FMT)}
              {project.targetEndDate && (
                <> · Cierre: {project.targetEndDate.toLocaleDateString("es-CO", DATE_FMT)}</>
              )}
              {project.repoUrl && (
                <>
                  {" · "}
                  <a href={project.repoUrl} target="_blank" rel="noreferrer" className="hover:underline">
                    Repositorio
                  </a>
                </>
              )}
            </div>
            {canManage && (
              <div className="mt-1.5 flex flex-wrap gap-2">
                <ModalTrigger label="Fecha de inicio" title="Editar fecha de inicio" variant="secondary" small>
                  <EditStartDateForm
                    projectId={project.id}
                    currentStartDate={project.startDate.toISOString().slice(0, 10)}
                  />
                </ModalTrigger>
                <ModalTrigger label="Fecha de cierre" title="Editar fecha de cierre" variant="secondary" small>
                  <EditTargetEndDateForm
                    projectId={project.id}
                    currentTargetEndDate={project.targetEndDate?.toISOString().slice(0, 10) ?? null}
                  />
                </ModalTrigger>
                <ModalTrigger label="Repositorio" title="Editar URL del repositorio" variant="secondary" small>
                  <EditRepoUrlForm projectId={project.id} currentRepoUrl={project.repoUrl} />
                </ModalTrigger>
              </div>
            )}
          </div>
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

      <div className="min-w-[220px] max-w-md space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <ProjectHealthBadges
            projectId={project.id}
            health={summaryHealth}
            overdueCount={summaryOverdueTasks.length}
            overdueTasks={summaryOverdueTasks}
            warningCount={summaryWarningTasks.length}
            warningTasks={summaryWarningTasks}
            lateStartCount={summaryLateStartTasks.length}
            lateStartTasks={summaryLateStartTasks}
            openSlackDays={summaryOpenSlackDays}
            scheduleVarianceDays={summaryScheduleVarianceDays}
          />
        </div>
        <ProjectProgress
          projectId={project.id}
          bottlenecks={bottlenecks}
          total={summaryTotal}
          completed={summaryCompleted}
        />
        <Link href={`/performance?projectId=${project.id}`} className="inline-block rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200">
          Rendimiento
        </Link>
      </div>
      </div>

      {canManage && (
        <div className="flex gap-2">
          <ModalTrigger label="+ Nueva tarea" title="Nueva tarea" variant="primary">
            <NewTaskForm
              projectId={project.id}
              phases={project.phases}
              users={users}
              otherTasks={project.tasks.map((t) => ({
                id: t.id,
                title: t.title,
                nextAvailableStart: nextAvailableStartById.get(t.id)!,
              }))}
            />
          </ModalTrigger>
          <ModalTrigger label="Compartir" title="Compartir proyecto" variant="secondary">
            <ShareLinkPanel
              activeToken={activeShareLink?.token ?? null}
              activeLinkId={activeShareLink?.id ?? null}
              onCreate={createProjectShareLink.bind(null, project.id)}
              onRevoke={revokeProjectShareLink.bind(null, project.id)}
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
          <Link
            href={filesHref({})}
            className={`rounded-lg px-3 py-1.5 ${view === "files" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            Archivos
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

      {view !== "definition" && view !== "files" && (
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3 text-sm">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Buscar</span>
          <SearchBox
            basePath={`/projects/${project.id}`}
            q={q}
            hiddenParams={{ view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), status, type, userId, risk }}
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
            currentParams={{ view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), status, type, risk, q }}
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
            basePath={`/projects/${project.id}`}
            currentParams={{ view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), userId, type, risk, q }}
            triggerColorClass={status ? `${TASK_STATUS_COLOR[status].solid} text-white` : undefined}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Tipo</span>
          <ComboFilter
            allLabel="Todos los tipos"
            value={type}
            options={(["SIMPLE", "MILESTONE", "QA", "ADJUSTMENT"] as const).map((tt) => ({
              id: tt,
              label: TASK_TYPE_LABEL[tt],
            }))}
            paramKey="type"
            basePath={`/projects/${project.id}`}
            currentParams={{ view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), userId, status, risk, q }}
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
            basePath={`/projects/${project.id}`}
            currentParams={{ view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), userId, status, type, q }}
            triggerColorClass={risk === "overdue" ? "bg-red-600 text-white" : risk === "warning" ? "bg-amber-500 text-white" : risk === "lateStart" ? "bg-blue-500 text-white" : undefined}
          />
        </div>

        {view === "gantt" && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">&nbsp;</span>
            <CriticalPathButton />
          </div>
        )}
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

      {view === "files" ? (
        <ProjectFilesView
          projectId={project.id}
          files={projectFiles.map((f) => ({
            id: f.id,
            taskId: f.taskId,
            taskTitle: f.taskTitle,
            fileUrl: f.fileUrl,
            fileName: f.fileName,
            mimeType: f.mimeType,
          }))}
          tasks={project.tasks.map((t) => ({ id: t.id, title: t.title }))}
          fileKind={projectFileKind}
          fileType={fileType}
          fileTask={fileTask}
          fileQ={fileQ}
          canDelete={canManage}
          filesHref={filesHref}
        />
      ) : view === "definition" ? (
        <DefinitionTab
          projectId={project.id}
          name={project.name}
          iconUrl={project.iconUrl}
          description={project.description}
          canManage={canManage}
          objectives={cascadeProgress.objectives}
          requirements={cascadeProgress.requirements}
          phases={cascadeProgress.phases}
          links={project.links}
          attachments={project.attachments}
          whatsappGroupJid={project.whatsappGroupJid}
        />
      ) : view === "gantt" ? (
        <div className="sticky top-[57px] h-[calc(100vh-100px)]">
          <GanttView
            businessDays={businessDays}
            tasks={ganttTasks}
            canManage={canManage}
            targetEndDate={project.targetEndDate?.toISOString() ?? null}
            users={users}
          />
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
