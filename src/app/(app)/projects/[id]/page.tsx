import { auth } from "@/auth";
import { Avatar } from "@/components/Avatar";
import { ComboFilter } from "@/components/ComboFilter";
import { ModalTrigger } from "@/components/Modal";
import { ProjectIcon } from "@/components/ProjectIcon";
import { InternalConversation } from "@/components/InternalConversation";
import { ProjectHealthBadges, ProjectProgress } from "@/components/ProjectSummary";
import { SearchBox } from "@/components/SearchBox";
import { ShareLinkPanel } from "@/components/ShareLinkPanel";
import { ShareIcon } from "@/components/icons";
import { attachmentFileType, LINK_MIME_TYPE } from "@/lib/attachments";
import { rangeForMode, stepAnchor, utcDate, type CalendarMode } from "@/lib/calendarGrid";
import { getProjectCascadeProgress } from "@/lib/cascadeProgress";
import { getBottlenecks, getTaskAlert, matchesRiskFilter, getProjectCompletionVariance } from "@/lib/delays";
import { addBusinessDays, businessDaysRange } from "@/lib/holidays";
import { getProjectAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { projectHealth } from "@/lib/projectHealth";
import { matchesTaskSearch, normalizeSearchText } from "@/lib/search";
import { getActiveShareLink } from "@/lib/shareLinks";
import { TASK_STATUS_COLOR, TASK_STATUS_LABEL, TASK_TYPE_LABEL } from "@/lib/statusColors";
import { buildTagFilterOptions, matchesTagFilter } from "@/lib/tags";
import type { TaskStatus, TaskType } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NavLinkWithMemory } from "../../NavLinkWithMemory";
import { RememberViewState } from "../../RememberViewState";
import { createProjectShareLink, revokeProjectShareLink } from "../../shareActions";
import { ArchiveProjectButton } from "./ArchiveProjectButton";
import { CriticalPathButton } from "./CriticalPathButton";
import { DefinitionTab } from "./DefinitionTab";
import { EditRepoUrlForm } from "./EditRepoUrlForm";
import { EditStartDateForm } from "./EditStartDateForm";
import { EditTargetEndDateForm } from "./EditTargetEndDateForm";
import { GanttView, type GanttTask } from "./GanttView";
import { KanbanBoard, type TaskCard } from "./KanbanBoard";
import { NewTaskForm } from "./NewTaskForm";
import { ProjectCalendarView, type CalendarTask } from "./ProjectCalendarView";
import { ProjectFilesView } from "./ProjectFilesView";
import { ReassignPMForm } from "./ReassignPMForm";
import { SaveLastProject } from "./SaveLastProject";

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
    type?: TaskType | "RETURNED_MINE" | "REVIEWING_MINE";
    userId?: string;
    risk?: "overdue" | "warning" | "lateStart" | "startingSoon";
    q?: string;
    tag?: string;
    fileKind?: string;
    fileType?: string;
    fileTask?: string;
    fileQ?: string;
  }>;
}) {
  const { id } = await params;
  const { view, date, mode, status, type, userId, risk, q, tag, fileKind, fileType, fileTask, fileQ } = await searchParams;
  const session = await auth();
  const myUserId = session?.user?.id ?? null;
  const isGlobalAdmin = session?.user?.role === "ADMIN";
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
      tag,
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
    const merged: Record<string, string | undefined> = { view, mode, date, status, type, userId, risk, q, tag, ...overrides };
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

  const [project, users, canManage, bottlenecks, cascadeProgress, activeShareLink, testTemplates, taskShareLinks, tagCategories, projectTags] = await Promise.all([
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
            reviewers: { include: { user: true } },
            reviewRounds: { select: { outcome: true } },
            taskTags: { include: { tag: { include: { category: true } } } },
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
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    getProjectAdmin(id).then(Boolean),
    getBottlenecks(id),
    getProjectCascadeProgress(id),
    getActiveShareLink("PROJECT", id),
    prisma.testTemplate.findMany({ select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
    // Un link por tarea a la vez (createShareLink revoca el anterior) — se
    // usa tanto para el indicador de copiar-en-un-clic (Kanban/Gantt) como
    // para listar los links compartidos en la vista Archivos.
    prisma.shareLink.findMany({
      where: { targetType: "TASK", revokedAt: null, task: { projectId: id } },
      select: { id: true, taskId: true, token: true },
    }),
    prisma.tagCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.tag.findMany({ where: { projectId: id }, select: { id: true, categoryId: true, name: true } }),
  ]);

  if (!project) notFound();
  const taskShareTokenById = new Map(taskShareLinks.map((l) => [l.taskId!, l.token]));

  // Punto 17: nombres ya usados en ESTE proyecto, agrupados por categoría —
  // alimenta el <datalist> del picker de etiquetas (sugiere sin obligar).
  const projectTagNamesByCategory: Record<string, string[]> = {};
  for (const t of projectTags) {
    (projectTagNamesByCategory[t.categoryId] ??= []).push(t.name);
  }

  const bottleneckReasonById = new Map(bottlenecks.map((t) => [t.id, t.bottleneckReason]));

  // Gantt y Tablero, ordenados cronológicamente por fecha de inicio (pedido
  // confirmado con el usuario) — primero por el orden de la fase (para no
  // desarmar el agrupamiento por fase del Gantt) y dentro de esa fase, por
  // plannedStart. Se calcula acá, en el Server Component, así que solo se
  // reordena al volver a cargar la página — mientras el usuario arrastra una
  // barra en el Gantt no hay ningún refresh en curso, entonces la fila no
  // salta de lugar hasta soltar y recargar.
  const phaseOrderById = new Map(project.phases.map((p) => [p.id, p.order]));
  const tasksSortedByPhaseThenStart = [...project.tasks].sort((a, b) => {
    const phaseDiff = (phaseOrderById.get(a.phaseId) ?? 0) - (phaseOrderById.get(b.phaseId) ?? 0);
    if (phaseDiff !== 0) return phaseDiff;
    return a.plannedStart.getTime() - b.plannedStart.getTime();
  });

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
  // Punto confirmado con el usuario: el badge general del proyecto compara
  // el cierre comprometido (targetEndDate) contra cuándo terminaría de
  // verdad el proyecto completo (la tarea de cierre más tardía, real o
  // planeada) — no la suma de cuánto se atrasaron las tareas YA completadas
  // (esa suma ignoraba todo lo que falta y confundía al compararla con el
  // Gantt). Ver getProjectCompletionVariance en delays.ts.
  const summaryScheduleVarianceDays = await getProjectCompletionVariance(
    project.countryCode,
    project.targetEndDate,
    project.tasks
  );

  const matchesRisk = (taskId: string) => matchesRiskFilter(alertByTaskId.get(taskId)!, risk);
  // "Devueltas"/"Revisión" del filtro Tipo (punto 11 confirmado): no son un
  // TaskType real, son un atajo personal — "me devolvieron a mí" y "tengo
  // que revisarle a otro" — sobre los mismos datos que ya alimentan las
  // alertas fijas del header (ver HeaderAlerts/layout.tsx).
  const matchesType = (t: {
    type: string;
    status: string;
    assignees: { userId: string }[];
    reviewers: { userId: string }[];
    reviewRounds: { outcome: string | null }[];
  }) => {
    if (!type) return true;
    // "Devueltas"/"Revisión" son personales a propósito — el filtro de
    // Estado ya tiene "Devuelta" para ver todas las del proyecto sin
    // importar a quién; esto es distinto: solo las mías.
    if (type === "RETURNED_MINE") {
      return t.status === "RETURNED" && Boolean(myUserId) && t.assignees.some((a) => a.userId === myUserId);
    }
    if (type === "REVIEWING_MINE") {
      return Boolean(myUserId) && t.reviewers.some((r) => r.userId === myUserId) && t.reviewRounds.some((r) => r.outcome === null);
    }
    return t.type === type;
  };
  const matchesFilters = (t: {
    id: string;
    status: string;
    type: string;
    title: string;
    description: string | null;
    assignees: { userId: string }[];
    attachments: { fileName: string }[];
    reviewers: { userId: string }[];
    reviewRounds: { outcome: string | null }[];
    taskTags: { tagId: string; categoryId: string }[];
  }) =>
    matchesRisk(t.id) &&
    (!status || t.status === status) &&
    matchesType(t) &&
    (!userId || t.assignees.some((a) => a.userId === userId)) &&
    matchesTagFilter(tag, t.taskTags) &&
    matchesTaskSearch(t, q);

  const taskCards: TaskCard[] = tasksSortedByPhaseThenStart.filter(matchesFilters).map((t) => ({
    id: t.id,
    projectId: project.id,
    projectName: project.name,
    projectIconUrl: project.iconUrl,
    title: t.title,
    type: t.type,
    status: t.status,
    riskLevel: t.riskLevel,
    canManage,
    updatedAt: t.updatedAt.toISOString(),
    assignees: t.assignees.map((a) => ({ name: a.user.name, avatarUrl: a.user.avatarUrl })),
    assigneeIds: t.assignees.map((a) => a.userId),
    reviewers: t.reviewers.map((r) => ({ name: r.user.name, avatarUrl: r.user.avatarUrl })),
    tags: t.taskTags.map((tt) => ({ id: tt.tagId, name: tt.tag.name, colorHex: tt.tag.category.colorHex, emoji: tt.tag.category.emoji })),
    plannedStart: t.plannedStart.toISOString(),
    plannedEnd: t.plannedEnd.toISOString(),
    stepsProgress:
      t.steps.length > 0
        ? { done: t.steps.filter((s) => s.done).length, total: t.steps.length }
        : null,
    attachmentsCount: t.attachments.length,
    alert: alertByTaskId.get(t.id)!,
    collidesWith: null,
    shareToken: taskShareTokenById.get(t.id) ?? null,
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

  const ganttTasks: GanttTask[] = tasksSortedByPhaseThenStart.filter(matchesFilters).map((t) => {
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
      canManage,
      updatedAt: t.updatedAt.toISOString(),
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
      assignees: t.assignees.map((a) => ({ name: a.user.name, avatarUrl: a.user.avatarUrl })),
      reviewers: t.reviewers.map((r) => ({ name: r.user.name, avatarUrl: r.user.avatarUrl })),
      tags: t.taskTags.map((tt) => ({ id: tt.tagId, name: tt.tag.name, colorHex: tt.tag.category.colorHex, emoji: tt.tag.category.emoji })),
      shareToken: taskShareTokenById.get(t.id) ?? null,
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

  // Ausente = "Todos" (nuevo default); solo "INSUMO"/"RESULTADO" acotan a una
  // de las dos pestañas.
  const projectFileKind: "INSUMO" | "RESULTADO" | undefined =
    fileKind === "RESULTADO" ? "RESULTADO" : fileKind === "INSUMO" ? "INSUMO" : undefined;
  // Los archivos y links subidos directo al repositorio del proyecto (pestaña
  // Definición, no atados a ninguna tarea) cuentan como insumo del proyecto
  // en este filtro.
  const projectRepoFiles: { id: string; fileUrl: string; fileName: string; mimeType: string; taskId: string | null; taskTitle: string | null }[] =
    projectFileKind !== "RESULTADO"
      ? [
          ...project.attachments.map((a) => ({ ...a, taskId: null, taskTitle: null })),
          ...project.links.map((l) => ({ id: l.id, fileUrl: l.url, fileName: l.title, mimeType: LINK_MIME_TYPE, taskId: null, taskTitle: null })),
        ]
      : [];
  const projectFiles = project.tasks
    .flatMap((t) =>
      t.attachments
        .filter((a) => !projectFileKind || a.kind === projectFileKind)
        .map((a) => ({ id: a.id, fileUrl: a.fileUrl, fileName: a.fileName, mimeType: a.mimeType, taskId: t.id as string | null, taskTitle: t.title as string | null }))
    )
    .concat(projectRepoFiles)
    .filter((a) => !fileType || fileType === "all" || attachmentFileType(a.mimeType) === fileType)
    .filter((a) => !fileTask || a.taskId === fileTask)
    .filter((a) => !fileQ || normalizeSearchText(a.fileName).includes(normalizeSearchText(fileQ)));

  // Links compartidos (proyecto + tareas) buscables junto al resto de
  // archivos — distintos de un adjunto de tipo link (uno es un recurso
  // externo pegado a mano, esto da acceso público de solo lectura a ESTE
  // proyecto/tarea), por eso van en su propia sección, no mezclados en la
  // grilla de AttachmentGrid.
  const projectSharedLinks = [
    ...(activeShareLink && !fileTask
      ? [{ id: activeShareLink.id, label: `Proyecto — ${project.name}`, token: activeShareLink.token, href: `/projects/${project.id}` }]
      : []),
    ...taskShareLinks
      .filter((l) => !fileTask || l.taskId === fileTask)
      .map((l) => {
        const task = project.tasks.find((t) => t.id === l.taskId);
        return task ? { id: l.id, label: `Tarea — ${task.title}`, token: l.token, href: `/projects/${project.id}/tasks/${l.taskId}` } : null;
      })
      .filter((l): l is { id: string; label: string; token: string; href: string } => l !== null),
  ].filter((l) => !fileQ || normalizeSearchText(l.label).includes(normalizeSearchText(fileQ)));

  return (
    <div className="space-y-6">
      <SaveLastProject projectId={project.id} />
      <RememberViewState storageKey={`project:${project.id}`} />
      <NavLinkWithMemory href="/projects" storageKey="projectsBoard" className="text-sm text-slate-500 hover:underline">
        ← Todos los proyectos
      </NavLinkWithMemory>
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
                {isGlobalAdmin && (
                  <div className="ml-1.5 border-l border-slate-200 pl-2.5">
                    <ArchiveProjectButton projectId={project.id} projectName={project.name} />
                  </div>
                )}
              </div>
            )}
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
          <ModalTrigger label="+ Nueva tarea" title="Nueva tarea" variant="primary">
            <NewTaskForm
              projectId={project.id}
              phases={project.phases}
              users={users}
              templates={testTemplates}
              tagCategories={tagCategories}
              projectTagNamesByCategory={projectTagNamesByCategory}
              otherTasks={project.tasks.map((t) => ({
                id: t.id,
                title: t.title,
                nextAvailableStart: nextAvailableStartById.get(t.id)!,
              }))}
            />
          </ModalTrigger>
          <ModalTrigger label="Compartir" title="Compartir proyecto" variant="secondary" icon={<ShareIcon className="h-4 w-4" />}>
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
          <Link href={filterHref({ view: "conversation" })} className={`rounded-lg px-3 py-1.5 ${view === "conversation" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>Comentarios</Link>
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

      {view !== "definition" && view !== "files" && view !== "conversation" && (
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3 text-sm mb-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Buscar</span>
          <SearchBox
            basePath={`/projects/${project.id}`}
            q={q}
            hiddenParams={{ view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), status, type, userId, risk, tag }}
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
            currentParams={{ view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), status, type, risk, q, tag }}
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
            currentParams={{ view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), userId, type, risk, q, tag }}
            triggerColorClass={status ? `${TASK_STATUS_COLOR[status].solid} text-white` : undefined}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Tipo</span>
          <ComboFilter
            allLabel="Todos los tipos"
            value={type}
            options={[
              ...(["SIMPLE", "MILESTONE", "QA", "ADJUSTMENT", "ACCEPTANCE"] as const).map((tt) => ({
                id: tt,
                label: TASK_TYPE_LABEL[tt],
              })),
              { id: "RETURNED_MINE", label: "Devueltas (a mí)", dotColorClass: "bg-orange-500" },
              { id: "REVIEWING_MINE", label: "Revisión (mías)", dotColorClass: "bg-teal-500" },
            ]}
            paramKey="type"
            basePath={`/projects/${project.id}`}
            currentParams={{ view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), userId, status, risk, q, tag }}
          />
        </div>

        {projectTags.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Etiqueta</span>
            <ComboFilter
              allLabel="Todas las etiquetas"
              value={tag}
              options={buildTagFilterOptions(tagCategories, projectTags)}
              paramKey="tag"
              basePath={`/projects/${project.id}`}
              currentParams={{ view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), userId, status, type, risk, q }}
            />
          </div>
        )}

        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Alerta</span>
          <ComboFilter
            allLabel="Todas las alertas"
            value={risk}
            options={[
              // Preventivo — solo para quien administra este proyecto.
              ...(canManage ? [{ id: "startingSoon", label: "Empieza pronto", dotColorClass: "bg-cyan-500" }] : []),
              { id: "lateStart", label: "Inicio retrasado", dotColorClass: "bg-blue-400" },
              { id: "warning", label: "Por vencer", dotColorClass: "bg-amber-500" },
              { id: "overdue", label: "Final retrasado", dotColorClass: "bg-red-500" },
            ]}
            paramKey="risk"
            basePath={`/projects/${project.id}`}
            currentParams={{ view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), userId, status, type, q, tag }}
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

      {view === "conversation" ? <InternalConversation projectId={project.id} title="Conversación del proyecto" /> : view === "files" ? (
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
          sharedLinks={projectSharedLinks}
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
        <div className="sticky-view-panel-gantt sticky top-[57px] h-[calc(100vh-150px)]">
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
        <div className="sticky-view-panel-kanban sticky top-[57px] h-[calc(100vh-150px)]">
          <KanbanBoard
            key={taskCards.map((t) => `${t.id}:${t.status}`).join(",")}
            initialTasks={taskCards}
            users={users}
          />
        </div>
      )}
    </div>
  );
}
