import { credentialVisibleWhere } from "@/lib/credentials";
import { auth } from "@/auth";
import { canSeeProject, managedProjectWhere, visibleProjectWhere } from "@/lib/permissions";
import { worstVariance } from "@/lib/subprojects";
import { Avatar } from "@/components/Avatar";
import { ComboFilter } from "@/components/ComboFilter";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { ResetFiltersButton } from "@/components/ResetFiltersButton";
import { MobileFiltersToggle } from "@/components/MobileFiltersToggle";
import { MobileCalendarDayEnforcer } from "@/components/MobileCalendarDayEnforcer";
import { matchesDateRange, parseDayKey } from "@/lib/dateRange";
import { ModalTrigger } from "@/components/Modal";
import { ProjectIcon, ProjectIconGroup } from "@/components/ProjectIcon";
import { InternalConversation } from "@/components/InternalConversation";
import { ProjectHealthBadges, ProjectProgress } from "@/components/ProjectSummary";
import { SearchBox } from "@/components/SearchBox";
import { ShareLinkPanel } from "@/components/ShareLinkPanel";
import { ClaudeLinkPanel } from "@/components/ClaudeLinkPanel";
import { getActiveClaudeLink } from "@/lib/apiAuth";
import { EyeOffIcon, ShareIcon, SparklesIcon } from "@/components/icons";
import { attachmentFileType, CREDENTIAL_MIME_TYPE, credentialRef, credentialUrlLabel, LINK_MIME_TYPE, repoLinkName } from "@/lib/attachments";
import { rangeForMode, stepAnchor, utcDate, type CalendarMode } from "@/lib/calendarGrid";
import { getProjectCascadeProgress } from "@/lib/cascadeProgress";
import { orderDefinitionBySchedule } from "@/lib/definitionOrder";
import { getBottlenecks, getTaskAlert, matchesRiskFilter } from "@/lib/delays";
import { getProjectForecast } from "@/lib/scheduleForecast";
import { getDesignFiles } from "@/lib/designFiles";
import { addBusinessDays, businessDaysRange } from "@/lib/holidays";
import { getProjectAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { projectHealth } from "@/lib/projectHealth";
import { ATTRIBUTE_TYPE_OPTIONS, attributeTypeTriggerClass, hasUploadedFiles, isAttributeType, matchesAttributeType } from "@/lib/taskTypeFilter";
import { matchesTaskSearch, normalizeSearchText } from "@/lib/search";
import { getActiveShareLink } from "@/lib/shareLinks";
import { TASK_STATUS_COLOR, TASK_STATUS_LABEL, TASK_TYPE_LABEL } from "@/lib/statusColors";
import { buildTagFilterOptions, matchesTagFilter } from "@/lib/tags";
import type { Prisma, TaskStatus, TaskType } from "@prisma/client";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { viewCookieName } from "@/lib/viewCookie";
import { NavLinkWithMemory } from "../../NavLinkWithMemory";
import { RememberViewState } from "../../RememberViewState";
import { createProjectShareLink, revokeProjectShareLink } from "../../shareActions";
import { ArchiveProjectButton } from "./ArchiveProjectButton";
import { ArchiveToggleButton } from "./ArchiveToggleButton";
import { CriticalPathButton } from "./CriticalPathButton";
import { DefinitionTab } from "./DefinitionTab";
import { EditReposForm } from "./EditReposForm";
import { HideProjectButton } from "./HideProjectButton";
import { EditStartDateForm } from "./EditStartDateForm";
import { EditTargetEndDateForm } from "./EditTargetEndDateForm";
import { GanttView, type GanttTask } from "./GanttView";
import { KanbanBoard, type TaskCard } from "./KanbanBoard";
import { NewTaskForm } from "./NewTaskForm";
import { ProjectCalendarView, type CalendarTask } from "./ProjectCalendarView";
import { ProjectFilesView } from "./ProjectFilesView";
import { ReassignPMForm } from "./ReassignPMForm";
import { SaveLastProject } from "./SaveLastProject";

// Lo que cada vista necesita de una tarea — mismo include para las del proyecto y, en un proyecto
// principal (spec 004), para las de sus subproyectos.
const taskInclude = {
  assignees: { include: { user: true } },
  reviewers: { include: { user: true } },
  reviewRounds: { select: { outcome: true } },
  taskTags: { include: { tag: { include: { category: true } } } },
  steps: true,
  attachments: { select: { id: true, fileName: true, fileUrl: true, mimeType: true, kind: true, uploadedAt: true } },
  dependsOn: {
    include: {
      predecessor: {
        select: { id: true, title: true, status: true, plannedStart: true, plannedEnd: true, actualEnd: true },
      },
    },
  },
  blocks: { include: { successor: { select: { id: true, title: true } } } },
} satisfies Prisma.TaskInclude;

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
    type?: TaskType | "RETURNED_MINE" | "REVIEWING_MINE" | "NEW" | "WITH_FILES" | "SHARED";
    userId?: string;
    risk?: "overdue" | "warning" | "lateStart" | "startingSoon";
    q?: string;
    tag?: string;
    from?: string;
    to?: string;
    fileKind?: string;
    fileType?: string;
    fileTask?: string;
    fileQ?: string;
    archived?: string;
    /** Spec 004: filtro «Proyecto» de un proyecto principal (reemplaza a Buscar). */
    proj?: string;
    fileProject?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  // Sin filtros en la URL (enlace suelto: buscador, aviso, lista…): se abre DIRECTO en la última vista de este
  // proyecto (cookie que deja RememberViewState). Se hace acá, en el servidor, para no mostrar antes la vista por defecto.
  if (Object.keys(sp).length === 0) {
    const raw = (await cookies()).get(viewCookieName(`project:${id}`))?.value;
    let saved = "";
    try {
      saved = raw ? decodeURIComponent(raw) : "";
    } catch {
      saved = raw ?? "";
    }
    if (saved && saved.length < 1500) redirect(`/projects/${id}?${saved}`);
  }
  const { view: viewParam, date, mode, status, type, userId, risk, q, tag, from: fromParam, to: toParam, fileKind, fileType, fileTask, fileQ, archived, proj, fileProject } = sp;
  // «Archivadas» vive en el filtro Estado (solo Admin/PM): status=ARCHIVED. `archived=1` queda por compatibilidad.
  const archivedView = archived === "1" || (status as string | undefined) === "ARCHIVED";
  const from = parseDayKey(fromParam);
  const to = parseDayKey(toParam);
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
      from,
      to,
      proj,
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
    const merged: Record<string, string | undefined> = { view, mode, date, status, type, userId, risk, q, tag, from, to, archived, proj, ...overrides };
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
    const merged: Record<string, string | undefined> = { fileKind, fileType, fileTask, fileQ, fileProject, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
    }
    return `/projects/${id}?${p.toString()}`;
  };

  const [project, users, canManage, bottlenecks, cascadeProgress, activeShareLink, testTemplates, taskShareLinks, tagCategories, projectTags, activeClaudeLink] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        pm: true,
        phases: { orderBy: { order: "asc" } },
        links: { orderBy: { createdAt: "asc" } },
        repos: { orderBy: { createdAt: "asc" } },
        attachments: { orderBy: { uploadedAt: "asc" } },
        tasks: { include: taskInclude },
        parent: { select: { id: true, name: true, iconUrl: true, pmId: true } },
        // Spec 004: subproyectos que esta persona puede ver (los ocultos, solo su admin responsable). Se traen
        // también los archivados para que un principal archivado siga mostrando su grupo (se filtran abajo).
        children: {
          where: session?.user ? visibleProjectWhere(session.user, { includeArchived: true }) : { id: "" },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            iconUrl: true,
            countryCode: true,
            startDate: true,
            archivedAt: true,
            repoUrl: true,
            pm: { select: { name: true, avatarUrl: true } },
            phases: { orderBy: { order: "asc" } },
            attachments: { orderBy: { uploadedAt: "asc" } },
            links: { orderBy: { createdAt: "asc" } },
            repos: { orderBy: { createdAt: "asc" } },
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
    myUserId ? getActiveClaudeLink(myUserId, { projectId: id }) : Promise.resolve(null),
  ]);

  if (!project) notFound();
  // Un proyecto oculto solo lo ve el administrador que es su responsable (PM).
  if (!session?.user || !canSeeProject(project, session.user)) notFound();
  const orderedDefinition = orderDefinitionBySchedule(cascadeProgress, project.tasks);
  // Credenciales que ESTA persona puede ver (las demás no existen para ella: ni nombre ni ficha).
  const credentials = await prisma.credential.findMany({
    where: { projectId: project.id, ...credentialVisibleWhere(session.user) },
    select: { id: true, name: true, url: true, createdAt: true, tasks: { select: { taskId: true, addedAt: true } } },
    orderBy: { createdAt: "desc" },
  });

  // ─── Spec 004: proyecto principal = panorama de su grupo (él + sus subproyectos) ───
  // Principal activo: solo sus hijos activos (un hijo archivado por separado sale de su vista, RF-29).
  // Principal archivado: sus hijos archivados con él, para poder verlo y desarchivarlo completo.
  const children = project.archivedAt ? project.children : project.children.filter((c) => !c.archivedAt);
  const isParent = children.length > 0;
  const childIds = children.map((c) => c.id);
  const viewer = session.user;
  const [childTasks, childAdminIds, childBottlenecks, childVariances, childShareLinks, childCredentials, linkableProjects, parentObjectives] = await Promise.all([
    isParent ? prisma.task.findMany({ where: { projectId: { in: childIds } }, include: taskInclude }) : Promise.resolve([]),
    Promise.all(childIds.map(async (cid) => ((await getProjectAdmin(cid)) ? cid : null))),
    Promise.all(childIds.map((cid) => getBottlenecks(cid))),
    Promise.all(childIds.map(async (cid) => (await getProjectForecast(cid)).varianceDays)),
    isParent
      ? prisma.shareLink.findMany({
          where: { revokedAt: null, OR: [{ targetType: "TASK", task: { projectId: { in: childIds } } }, { targetType: "PROJECT", projectId: { in: childIds } }] },
          select: { id: true, targetType: true, projectId: true, taskId: true, token: true },
        })
      : Promise.resolve([]),
    isParent
      ? prisma.credential.findMany({
          where: { projectId: { in: childIds }, ...credentialVisibleWhere(viewer) },
          select: { id: true, name: true, url: true, createdAt: true, projectId: true, tasks: { select: { taskId: true, addedAt: true } } },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    // «Vincular existente»: activos, sin principal ni subproyectos, que esta persona también administra.
    canManage && !project.parentId
      ? prisma.project.findMany({
          where: { id: { not: project.id }, parentId: null, children: { none: {} }, ...visibleProjectWhere(viewer), ...(isGlobalAdmin ? {} : managedProjectWhere(viewer.id)) },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    project.parentId
      ? prisma.objective.findMany({ where: { projectId: project.parentId }, select: { id: true, title: true }, orderBy: { order: "asc" } })
      : Promise.resolve(undefined),
  ]);
  const allTasks = [...project.tasks, ...childTasks];
  const childAdminSet = new Set(childAdminIds.filter((v): v is string => v !== null));
  const canManageProject = (pid: string) => (pid === project.id ? canManage : childAdminSet.has(pid));
  const parentIcon = { id: project.id, name: project.name, iconUrl: project.iconUrl };
  const projectInfo = new Map<string, { name: string; iconUrl: string | null; countryCode: string; parent: { id: string; name: string; iconUrl: string | null } | null }>([
    [project.id, { name: project.name, iconUrl: project.iconUrl, countryCode: project.countryCode, parent: null }],
    ...children.map((c) => [c.id, { name: c.name, iconUrl: c.iconUrl, countryCode: c.countryCode, parent: parentIcon }] as const),
  ]);
  const info = (pid: string) => projectInfo.get(pid)!;
  // Filtro «Proyecto» del principal: el principal (solo sus tareas) o un subproyecto.
  const projFilter = isParent && proj && projectInfo.has(proj) ? proj : undefined;
  const projectFilterOptions = [{ id: project.id, label: project.name }, ...children.map((c) => ({ id: c.id, label: c.name }))];
  const childPct = (cid: string) => {
    const own = childTasks.filter((t) => t.projectId === cid);
    return own.length > 0 ? Math.round((own.filter((t) => t.status === "COMPLETED").length / own.length) * 100) : 0;
  };

  // Sin ?view= en la URL: un proyecto sin nada definido (sin descripción, objetivos
  // ni requerimientos) abre en Definición; el resto, en el Tablero de siempre.
  const definitionEmpty = !project.description?.trim() && cascadeProgress.objectives.length === 0 && cascadeProgress.requirements.length === 0;
  const view = viewParam ?? (definitionEmpty ? "definition" : undefined);

  const taskShareTokenById = new Map([...taskShareLinks, ...childShareLinks.filter((l) => l.targetType === "TASK")].map((l) => [l.taskId!, l.token]));

  // Punto 17: nombres ya usados en ESTE proyecto, agrupados por categoría —
  // alimenta el <datalist> del picker de etiquetas (sugiere sin obligar).
  const projectTagNamesByCategory: Record<string, string[]> = {};
  for (const t of projectTags) {
    // Etiqueta sin nombre (solo categoría): no es una sugerencia de nombre.
    if (t.name) (projectTagNamesByCategory[t.categoryId] ??= []).push(t.name);
  }

  // Repositorio principal (repoUrl) + los adicionales.
  const repoUrls = [...new Set([...(project.repoUrl ? [project.repoUrl] : []), ...project.repos.map((r) => r.url)])];
  const groupBottlenecks = [...bottlenecks, ...childBottlenecks.flat()];
  const bottleneckReasonById = new Map(groupBottlenecks.map((t) => [t.id, t.bottleneckReason]));

  // Gantt y Tablero, ordenados cronológicamente por fecha de inicio (pedido
  // confirmado con el usuario) — primero por el orden de la fase (para no
  // desarmar el agrupamiento por fase del Gantt) y dentro de esa fase, por
  // plannedStart. Se calcula acá, en el Server Component, así que solo se
  // reordena al volver a cargar la página — mientras el usuario arrastra una
  // barra en el Gantt no hay ningún refresh en curso, entonces la fila no
  // salta de lugar hasta soltar y recargar.
  const allPhases = [...project.phases, ...children.flatMap((c) => c.phases)];
  const phaseOrderById = new Map(allPhases.map((p) => [p.id, p.order]));
  // Grupo (spec 004): primero el principal, luego cada subproyecto — así el Gantt queda agrupado por proyecto.
  const projectOrder = new Map([project.id, ...childIds].map((pid, i) => [pid, i]));
  const tasksSortedByPhaseThenStart = [...allTasks].sort((a, b) => {
    const projectDiff = (projectOrder.get(a.projectId) ?? 0) - (projectOrder.get(b.projectId) ?? 0);
    if (projectDiff !== 0) return projectDiff;
    const phaseDiff = (phaseOrderById.get(a.phaseId) ?? 0) - (phaseOrderById.get(b.phaseId) ?? 0);
    if (phaseDiff !== 0) return phaseDiff;
    return a.plannedStart.getTime() - b.plannedStart.getTime();
  });

  // Las tareas archivadas (completadas, sin borrar) salen de Tablero, Gantt y
  // Calendario; se ven solo con el enlace «Archivadas». Los totales del
  // resumen (avance, salud) siguen contando TODAS las tareas.
  const archivedCount = allTasks.filter((t) => t.archivedAt).length;
  const inCurrentView = (t: { archivedAt: Date | null }) => (archivedView ? t.archivedAt !== null : t.archivedAt === null);
  const viewTasks = tasksSortedByPhaseThenStart.filter(inCurrentView);

  const alertByTaskId = new Map(
    await Promise.all(
      allTasks.map(async (t) => [t.id, await getTaskAlert(info(t.projectId).countryCode, t)] as const)
    )
  );
  // Mismo resumen que la card de /projects (salud, progreso, cuellos de
  // botella) — pedido explícito del usuario, sin filtrar por los filtros de
  // la vista (siempre sobre TODAS las tareas del proyecto).
  // En un proyecto principal los totales suman el grupo (RF-23); en los demás allTasks = sus tareas.
  const summaryOverdueTasks = allTasks
    .filter((t) => alertByTaskId.get(t.id)!.level === "overdue")
    .map((t) => ({ id: t.id, title: t.title }));
  const summaryWarningTasks = allTasks
    .filter((t) => alertByTaskId.get(t.id)!.level === "warning")
    .map((t) => ({ id: t.id, title: t.title }));
  const summaryLateStartTasks = allTasks
    .filter((t) => alertByTaskId.get(t.id)!.level === "lateStart")
    .map((t) => ({ id: t.id, title: t.title }));
  const summaryTotal = allTasks.length;
  const summaryCompleted = allTasks.filter((t) => t.status === "COMPLETED").length;
  const summaryHealth = projectHealth(summaryOverdueTasks.length, summaryTotal);
  const phaseSlackValues = cascadeProgress.phases.map((p) => p.openSlackDays).filter((v): v is number => v !== null);
  const summaryOpenSlackDays = phaseSlackValues.length > 0 ? Math.min(...phaseSlackValues) : null;
  // Retraso u holgura si sigue al ritmo actual (spec 003, scheduleForecast.ts).
  const summaryScheduleVarianceDays = worstVariance([(await getProjectForecast(project.id)).varianceDays, ...childVariances]);

  const matchesRisk = (taskId: string) => matchesRiskFilter(alertByTaskId.get(taskId)!, risk);
  // "Devueltas"/"Revisión" del filtro Tipo (punto 11 confirmado): no son un
  // TaskType real, son un atajo personal — "me devolvieron a mí" y "tengo
  // que revisarle a otro" — sobre los mismos datos que ya alimentan las
  // alertas fijas del header (ver HeaderAlerts/layout.tsx).
  const matchesType = (t: {
    id: string;
    type: string;
    status: string;
    assignees: { userId: string; viewedAt: Date | null }[];
    attachments: { mimeType: string }[];
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
    // Opciones de atributo del mismo filtro Tipo (Nuevas / Archivos adjuntos /
    // Compartidas) — ver taskTypeFilter.ts.
    if (isAttributeType(type)) {
      return matchesAttributeType(type, {
        isNewForMe: Boolean(myUserId) && t.assignees.some((a) => a.userId === myUserId && a.viewedAt === null),
        hasFiles: hasUploadedFiles(t.attachments),
        isShared: taskShareTokenById.has(t.id),
      });
    }
    return t.type === type;
  };
  const matchesFilters = (t: {
    id: string;
    projectId: string;
    status: string;
    type: string;
    title: string;
    description: string | null;
    assignees: { userId: string; viewedAt: Date | null }[];
    attachments: { fileName: string; mimeType: string }[];
    reviewers: { userId: string }[];
    reviewRounds: { outcome: string | null }[];
    taskTags: { tagId: string; categoryId: string }[];
    plannedStart: Date;
    plannedEnd: Date;
  }) =>
    matchesRisk(t.id) &&
    matchesDateRange(t, from, to) &&
    (!status || (status as string) === "ARCHIVED" || t.status === status) &&
    matchesType(t) &&
    (!userId || t.assignees.some((a) => a.userId === userId)) &&
    matchesTagFilter(tag, t.taskTags) &&
    (!projFilter || t.projectId === projFilter) &&
    // En un principal el filtro «Proyecto» reemplaza a Buscar.
    matchesTaskSearch(t, isParent ? undefined : q);

  const taskCards: TaskCard[] = viewTasks.filter(matchesFilters).map((t) => ({
    isUrgent: t.isUrgent,
    isArchived: t.archivedAt !== null,
    id: t.id,
    projectId: t.projectId,
    projectName: info(t.projectId).name,
    projectIconUrl: info(t.projectId).iconUrl,
    projectParent: info(t.projectId).parent,
    title: t.title,
    type: t.type,
    status: t.status,
    riskLevel: t.riskLevel,
    canManage: canManageProject(t.projectId),
    updatedAt: t.updatedAt.toISOString(),
    assignees: t.assignees.map((a) => ({ name: a.user.name, avatarUrl: a.user.avatarUrl })),
    assigneeIds: t.assignees.map((a) => a.userId),
    reviewers: t.reviewers.map((r) => ({ name: r.user.name, avatarUrl: r.user.avatarUrl })),
    tags: t.taskTags.map((tt) => ({ id: tt.tagId, categoryId: tt.tag.categoryId, categoryName: tt.tag.category.name, name: tt.tag.name, colorHex: tt.tag.category.colorHex, emoji: tt.tag.category.emoji })),
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
    allTasks.length > 0
      ? new Date(Math.max(...allTasks.flatMap((t) => [t.plannedEnd.getTime(), t.actualEnd?.getTime() ?? 0])))
      : project.startDate;
  // El Gantt del principal arranca en el inicio más temprano del grupo.
  const gridStart = new Date(Math.min(project.startDate.getTime(), ...children.map((c) => c.startDate.getTime())));
  // Margen para poder arrastrar el fin de la última tarea del proyecto más
  // allá de lo ya planeado (bug real: sin esto, businessDays terminaba
  // justo en su plannedEnd y el handle de la derecha quedaba clampeado en
  // el mismo lugar — no había ninguna columna futura a la que arrastrar). Si
  // el deadline del proyecto cae más lejos que eso, la grilla también debe
  // alcanzar para poder dibujar esa línea.
  const gridEnd = new Date(Math.max(rangeEnd.getTime(), project.targetEndDate?.getTime() ?? 0));
  gridEnd.setUTCDate(gridEnd.getUTCDate() + 30);
  const businessDays = await businessDaysRange(project.countryCode, gridStart, gridEnd);

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

  const ganttTasks: GanttTask[] = viewTasks.filter(matchesFilters).map((t) => {
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
      isUrgent: t.isUrgent,
      projectId: t.projectId,
      projectName: info(t.projectId).name,
      projectIconUrl: info(t.projectId).iconUrl,
      projectParent: info(t.projectId).parent,
      title: t.title,
      phaseId: t.phaseId,
      phaseName: allPhases.find((p) => p.id === t.phaseId)?.name ?? "—",
      status: t.status,
      canManage: canManageProject(t.projectId),
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
      tags: t.taskTags.map((tt) => ({ id: tt.tagId, categoryId: tt.tag.categoryId, categoryName: tt.tag.category.name, name: tt.tag.name, colorHex: tt.tag.category.colorHex, emoji: tt.tag.category.emoji })),
      shareToken: taskShareTokenById.get(t.id) ?? null,
    };
  });

  const calendarTasks: CalendarTask[] = allTasks
    .filter(inCurrentView)
    .filter(matchesFilters)
    .map((t) => ({
      id: t.id,
      isUrgent: t.isUrgent,
      attachmentsCount: t.attachments.length,
      shareToken: taskShareTokenById.get(t.id) ?? null,
      projectId: t.projectId,
      projectName: info(t.projectId).name,
      // Dentro del principal no se antepone su nombre: ya se está en el grupo y taparía el título de la tarea.
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
  type FileRow = { id: string; fileUrl: string; fileName: string; mimeType: string; taskId: string | null; taskTitle: string | null; section?: string; readOnly?: boolean; uploadedAt?: Date; subtitle?: string; projectId: string };
  // Spec 004: en un principal, también los insumos de Definición de cada subproyecto.
  const groupRepoSources = [
    { id: project.id, attachments: project.attachments, links: project.links, repoUrls },
    ...children.map((c) => ({ id: c.id, attachments: c.attachments, links: c.links, repoUrls: [...new Set([...(c.repoUrl ? [c.repoUrl] : []), ...c.repos.map((r) => r.url)])] })),
  ];
  const projectRepoFiles: FileRow[] =
    projectFileKind !== "RESULTADO"
      ? groupRepoSources.flatMap((g) => [
          ...g.attachments.map((a) => ({ ...a, taskId: null, taskTitle: null, projectId: g.id })),
          ...g.links.map((l) => ({ id: l.id, fileUrl: l.url, fileName: l.title, mimeType: LINK_MIME_TYPE, taskId: null, taskTitle: null, uploadedAt: l.createdAt, projectId: g.id })),
          // Los repositorios vinculados también se listan como enlaces del proyecto.
          ...g.repoUrls.map((url, i) => ({ id: `repo-${g.id}-${i}`, fileUrl: url, fileName: repoLinkName(url, i, g.repoUrls.length), mimeType: LINK_MIME_TYPE, taskId: null, taskTitle: null, projectId: g.id })),
        ])
      : [];
  // Credenciales: una fila del proyecto (Definición) y una por tarea donde está como insumo — la
  // grilla las junta en una ficha con «usado en». Cuentan como insumo; no son evidencia.
  const taskTitleById = new Map(allTasks.map((t) => [t.id, t.title]));
  const credentialFiles: FileRow[] =
    projectFileKind !== "RESULTADO"
      ? [...credentials.map((c) => ({ ...c, projectId: project.id })), ...childCredentials].flatMap((c) => [
          { id: `cred-${c.id}`, fileUrl: credentialRef(c.id), fileName: c.name, mimeType: CREDENTIAL_MIME_TYPE, taskId: null, taskTitle: null, uploadedAt: c.createdAt, subtitle: credentialUrlLabel(c.url), projectId: c.projectId },
          ...c.tasks
            .filter((t) => taskTitleById.has(t.taskId))
            .map((t): FileRow => ({ id: `cred-${c.id}-${t.taskId}`, fileUrl: credentialRef(c.id), fileName: c.name, mimeType: CREDENTIAL_MIME_TYPE, taskId: t.taskId, taskTitle: taskTitleById.get(t.taskId)!, section: "Insumos", uploadedAt: t.addedAt, subtitle: credentialUrlLabel(c.url), projectId: c.projectId })),
        ])
      : [];
  const projectFiles = allTasks
    .flatMap((t) =>
      t.attachments
        .filter((a) => !projectFileKind || a.kind === projectFileKind)
        .map((a): FileRow => ({ id: a.id, fileUrl: a.fileUrl, fileName: a.fileName, mimeType: a.mimeType, taskId: t.id, taskTitle: t.title, section: a.kind === "RESULTADO" ? "Resultados" : "Insumos", uploadedAt: a.uploadedAt, projectId: t.projectId }))
    )
    .concat(projectRepoFiles)
    .concat(credentialFiles)
    // Spec 001: también los de Ajustes y rondas (solo en «Todos»: no son Insumos ni Evidencias de la tarea).
    .concat(
      view === "files" && !projectFileKind
        ? (await getDesignFiles([project.id, ...childIds])).map((f): FileRow => ({ id: f.id, fileUrl: f.fileUrl, fileName: f.fileName, mimeType: f.mimeType, taskId: f.taskId, taskTitle: f.taskTitle, section: f.section, readOnly: true, uploadedAt: f.uploadedAt, projectId: f.projectId }))
        : []
    )
    .filter((a) => !fileType || fileType === "all" || attachmentFileType(a.mimeType) === fileType)
    .filter((a) => !fileTask || a.taskId === fileTask)
    .filter((a) => !isParent || !fileProject || a.projectId === fileProject)
    .filter((a) => !fileQ || normalizeSearchText(a.fileName).includes(normalizeSearchText(fileQ)))
    // Lo más reciente primero: en un archivo usado en varios lugares, la ficha muestra el uso más reciente.
    .sort((a, b) => (b.uploadedAt?.getTime() ?? 0) - (a.uploadedAt?.getTime() ?? 0));

  // Links compartidos (proyecto + tareas) buscables junto al resto de
  // archivos — distintos de un adjunto de tipo link (uno es un recurso
  // externo pegado a mano, esto da acceso público de solo lectura a ESTE
  // proyecto/tarea), por eso van en su propia sección, no mezclados en la
  // grilla de AttachmentGrid.
  const projectSharedLinks = [
    ...(activeShareLink && !fileTask && (!isParent || !fileProject || fileProject === project.id)
      ? [{ id: activeShareLink.id, label: `Proyecto — ${project.name}`, token: activeShareLink.token, href: `/projects/${project.id}`, project: { name: project.name, iconUrl: project.iconUrl } }]
      : []),
    // Spec 004: links del cliente de cada subproyecto (cada uno con su propio link).
    ...childShareLinks
      .filter((l) => l.targetType === "PROJECT" && !fileTask && (!fileProject || l.projectId === fileProject))
      .map((l) => ({ id: l.id, label: `Proyecto — ${info(l.projectId!).name}`, token: l.token, href: `/projects/${l.projectId}`, project: { name: info(l.projectId!).name, iconUrl: info(l.projectId!).iconUrl, parent: info(l.projectId!).parent } })),
    ...[...taskShareLinks, ...childShareLinks.filter((l) => l.targetType === "TASK")]
      .filter((l) => !fileTask || l.taskId === fileTask)
      .map((l) => {
        const task = allTasks.find((t) => t.id === l.taskId);
        if (!task || (isParent && fileProject && task.projectId !== fileProject)) return null;
        const p = info(task.projectId);
        return { id: l.id, label: `Tarea — ${task.title}`, token: l.token, href: `/projects/${task.projectId}/tasks/${l.taskId}`, project: { name: p.name, iconUrl: p.iconUrl, parent: p.parent } };
      })
      .filter((l) => l !== null),
  ].filter((l) => !fileQ || normalizeSearchText(l.label).includes(normalizeSearchText(fileQ)));

  return (
    <div className="space-y-6">
      <SaveLastProject projectId={project.id} />
      <RememberViewState storageKey={`project:${project.id}`} />
      {/* Subproyecto (spec 004): «← Todos los proyectos | principal», cada uno lleva a su lugar. */}
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <NavLinkWithMemory href="/projects" storageKey="projectsBoard" className="hover:underline">
          ← Todos los proyectos
        </NavLinkWithMemory>
        {project.parent && (
          <>
            <span className="h-3.5 w-px bg-slate-400" aria-hidden />
            <NavLinkWithMemory href={`/projects/${project.parent.id}`} storageKey={`project:${project.parent.id}`} className="hover:underline">
              {project.parent.name}
            </NavLinkWithMemory>
          </>
        )}
      </div>
      {project.archivedAt && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>Proyecto archivado el {project.archivedAt.toLocaleDateString("es-CO", DATE_FMT)}. No aparece en el flujo normal.</span>
          {canManage && <ArchiveToggleButton projectId={project.id} archived openTaskCount={0} />}
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <ProjectIcon name={project.name} iconUrl={project.iconUrl} parent={project.parent} size="h-12 w-12 text-base" projectId={project.id} />
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
              {project.name}
              {project.hidden && (
                <span title="Oculto para el equipo: solo lo ves tú (admin)" className="text-amber-600">
                  <EyeOffIcon className="h-5 w-5" />
                </span>
              )}
              {isParent && <ProjectIconGroup projects={children} size="h-6 w-6 text-[10px]" />}
            </h1>
            {project.parent && (
              <p className="text-sm text-slate-500">
                Subproyecto de{" "}
                <Link href={`/projects/${project.parent.id}`} className="font-medium text-slate-700 hover:underline">
                  {project.parent.name}
                </Link>
              </p>
            )}
            <div className="text-sm text-slate-500">
              {project.clientName ?? "Interno"} · Inicio: {project.startDate.toLocaleDateString("es-CO", DATE_FMT)}
              {project.targetEndDate && (
                <> · Cierre: {project.targetEndDate.toLocaleDateString("es-CO", DATE_FMT)}</>
              )}
              {repoUrls.map((url, i) => (
                <span key={url}>
                  {" · "}
                  <a href={url} target="_blank" rel="noreferrer" title={url} className="hover:underline">
                    {repoUrls.length > 1 ? `Repositorio ${i + 1}` : "Repositorio"}
                  </a>
                </span>
              ))}
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
                <ModalTrigger label="Repositorios" title="Repositorios del proyecto" variant="secondary" small>
                  <EditReposForm projectId={project.id} urls={repoUrls} />
                </ModalTrigger>
                <div className="ml-1.5 flex items-center gap-2 border-l border-slate-200 pl-2.5">
                  {!project.archivedAt && (
                    <ArchiveToggleButton
                      projectId={project.id}
                      archived={false}
                      openTaskCount={allTasks.filter((t) => t.status !== "COMPLETED").length}
                      subprojectCount={children.length}
                    />
                  )}
                  {isGlobalAdmin && (project.pmId === myUserId || project.parent?.pmId === myUserId) && (
                    <>
                      <HideProjectButton projectId={project.id} hidden={project.hidden} subprojectCount={children.length} />
                      <ArchiveProjectButton projectId={project.id} projectName={project.name} subprojectCount={children.length} />
                    </>
                  )}
                </div>
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
            bottlenecks={groupBottlenecks}
            total={summaryTotal}
            completed={summaryCompleted}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/performance?projectId=${project.id}`} className="inline-block rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200">
              Rendimiento
            </Link>
            <ModalTrigger label="Conectar IA" title="Conectar IA" variant="secondary" compact icon={<SparklesIcon className="h-3.5 w-3.5" />}>
              <ClaudeLinkPanel projectId={project.id} activeLastUsedLabel={activeClaudeLink?.lastUsedAt.toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }) ?? null} />
            </ModalTrigger>
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
        {/* Mobile (< lg): una sola fila con scroll horizontal en vez de envolver en más líneas. */}
        <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1 lg:overflow-visible lg:pb-0">
          <Link
            href={filterHref({ view: "definition" })}
            className={`flex-shrink-0 rounded-lg px-3 py-1.5 ${view === "definition" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            Definición
          </Link>
          <Link
            href={filterHref({ view: "kanban" })}
            className={`flex-shrink-0 rounded-lg px-3 py-1.5 ${!view || view === "kanban" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            Tablero
          </Link>
          <Link
            href={filterHref({ view: "gantt" })}
            className={`flex-shrink-0 rounded-lg px-3 py-1.5 ${view === "gantt" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            Gantt
          </Link>
          <Link
            href={filterHref({ view: "calendar" })}
            className={`flex-shrink-0 rounded-lg px-3 py-1.5 ${view === "calendar" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            Calendario
          </Link>
          <Link
            href={filesHref({})}
            className={`flex-shrink-0 rounded-lg px-3 py-1.5 ${view === "files" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            Archivos
          </Link>
          <Link href={filterHref({ view: "conversation" })} className={`flex-shrink-0 rounded-lg px-3 py-1.5 ${view === "conversation" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>Comentarios</Link>
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
      <MobileFiltersToggle>
        {isParent ? (
          // Spec 004: en un proyecto principal el filtro «Proyecto» reemplaza a Buscar (ya está el buscador general).
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Proyecto</span>
            <ComboFilter
              allLabel="Todos los proyectos"
              value={projFilter}
              options={projectFilterOptions}
              paramKey="proj"
              basePath={`/projects/${project.id}`}
              currentParams={{ from, to, view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), status, type, userId, risk, tag }}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Buscar</span>
            <SearchBox
              basePath={`/projects/${project.id}`}
              q={q}
              hiddenParams={{ from, to, view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), status, type, userId, risk, tag }}
            />
          </div>
        )}

        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Persona</span>
          <ComboFilter
            allLabel="Todas las personas"
            value={userId}
            options={users.map((u) => ({ id: u.id, label: u.name }))}
            paramKey="userId"
            basePath={`/projects/${project.id}`}
            currentParams={{ from, to, view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), status, type, risk, q, proj, tag }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Estado</span>
          <ComboFilter
            allLabel="Todos los estados"
            value={status}
            options={[
              ...(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "RETURNED", "COMPLETED"] as const).map((s) => ({
                id: s as string,
                label: TASK_STATUS_LABEL[s],
                dotColorClass: TASK_STATUS_COLOR[s].dot,
              })),
              // Ver las tareas archivadas es para todos; desarchivar sigue siendo solo de Admin/PM.
              { id: "ARCHIVED", label: "Archivadas", dotColorClass: "bg-amber-500" },
            ]}
            paramKey="status"
            basePath={`/projects/${project.id}`}
            currentParams={{ from, to, view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), userId, type, risk, q, proj, tag }}
            triggerColorClass={status ? ((status as string) === "ARCHIVED" ? "bg-amber-500 text-white" : `${TASK_STATUS_COLOR[status].solid} text-white`) : undefined}
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
              ...ATTRIBUTE_TYPE_OPTIONS,
            ]}
            paramKey="type"
            basePath={`/projects/${project.id}`}
            currentParams={{ from, to, view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), userId, status, risk, q, proj, tag }}
            triggerColorClass={attributeTypeTriggerClass(type)}
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
              currentParams={{ from, to, view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), userId, status, type, risk, q, proj }}
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
            currentParams={{ from, to, view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), userId, status, type, q, proj, tag }}
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
          <DateRangeFilter
            from={from}
            to={to}
            basePath={`/projects/${project.id}`}
            currentParams={{ view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), userId, status, type, risk, q, proj, tag }}
          />
        </div>

        <ResetFiltersButton
          count={[q, projFilter, userId, status, type, tag, risk, from || to].filter(Boolean).length}
          href={filterHref({ status: undefined, type: undefined, userId: undefined, risk: undefined, q: undefined, tag: undefined, from: undefined, to: undefined, proj: undefined })}
        />

        {view === "gantt" && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">&nbsp;</span>
            <CriticalPathButton />
          </div>
        )}
      </MobileFiltersToggle>
      )}

      {/* Las archivadas no salen en Tablero/Gantt/Calendario: sin este aviso, un proyecto con
          todas sus tareas archivadas se ve vacío como si no tuviera ninguna. */}
      {!archivedView && archivedCount > 0 && (!view || view === "kanban" || view === "gantt" || view === "calendar") && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>
            {archivedCount === 1 ? "Hay 1 tarea archivada" : `Hay ${archivedCount} tareas archivadas`} en este proyecto.
          </span>
          <Link href={filterHref({ status: "ARCHIVED", archived: undefined })} className="font-medium underline underline-offset-2 hover:text-amber-950">
            Ver archivadas
          </Link>
        </div>
      )}

      {view === "calendar" && (
        <>
          {/* Debajo de lg solo hay vista Día (ver ProjectCalendarView) — nada de selector, y si
              venía de Mes/Semana lo redirige. De lg en adelante, selector normal. */}
          <MobileCalendarDayEnforcer isDayMode={calendarMode === "day"} dayHref={calendarHref({ mode: "day" })} />
          <p className="text-sm font-medium text-slate-600 lg:hidden">Vista: Día</p>
          <div className="hidden gap-1 text-sm lg:flex">
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
        </>
      )}

      {view === "conversation" ? (
        <div className="mx-auto max-w-5xl">
          <InternalConversation projectId={project.id} title="Conversación del proyecto" />
        </div>
      ) : view === "files" ? (
        <ProjectFilesView
          projectId={project.id}
          projectOptions={isParent ? projectFilterOptions : undefined}
          fileProject={isParent ? fileProject : undefined}
          files={projectFiles.map((f) => ({
            projectId: f.projectId,
            project: isParent ? { ...info(f.projectId), parent: info(f.projectId).parent } : undefined,
            id: f.id,
            taskId: f.taskId,
            taskTitle: f.taskTitle,
            fileUrl: f.fileUrl,
            fileName: f.fileName,
            mimeType: f.mimeType,
            section: f.section,
            readOnly: f.readOnly,
            subtitle: f.subtitle,
          }))}
          tasks={allTasks.map((t) => ({ id: t.id, title: t.title }))}
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
          objectives={orderedDefinition.objectives}
          requirements={orderedDefinition.requirements}
          phases={orderedDefinition.phases}
          links={project.links}
          attachments={project.attachments}
          credentials={credentials.map((c) => ({ id: c.id, name: c.name, url: c.url }))}
          whatsappGroupJid={project.whatsappGroupJid}
          subprojects={{
            parent: project.parent ? { id: project.parent.id, name: project.parent.name, iconUrl: project.parent.iconUrl } : null,
            subprojects: children.map((c) => ({ id: c.id, name: c.name, iconUrl: c.iconUrl, pmName: c.pm.name, pmAvatarUrl: c.pm.avatarUrl, pct: childPct(c.id) })),
            linkable: linkableProjects,
            users: users.map((u) => ({ id: u.id, name: u.name })),
          }}
          parentObjectives={parentObjectives}
          taskProgress={{ completed: summaryCompleted, total: summaryTotal }}
        />
      ) : view === "gantt" ? (
        <div className="sticky-view-panel-gantt sticky top-[57px] h-[calc(100vh-150px)]">
          <GanttView
            businessDays={businessDays}
            tasks={ganttTasks}
            canManage={canManage}
            targetEndDate={project.targetEndDate?.toISOString() ?? null}
            users={users}
            projectHeaders={isParent ? Object.fromEntries(childIds.map((cid) => [cid, { pct: childPct(cid) }])) : undefined}
          />
        </div>
      ) : view === "calendar" ? (
        <ProjectCalendarView tasks={calendarTasks} mode={calendarMode} anchor={anchor} showProjectName={isParent} />
      ) : (
        /* Mobile (< sm): columnas apiladas (grid-cols-1 en KanbanBoard) — sin altura fija para
           que cada una crezca con su contenido en vez de repartirse una altura de escritorio
           entre 4 filas. De sm en adelante (columnas lado a lado) vuelve a la altura fija con
           scroll propio por columna. */
        <div className="sticky-view-panel-kanban sticky top-[57px] h-auto sm:h-[calc(100vh-150px)]">
          <KanbanBoard
            // Solo cambia al cambiar los filtros (no al cambiar una tarea): así
            // las cards que dejaron de coincidir tras un cambio de estado
            // siguen visibles hasta que el usuario toque los filtros.
            key={[status, type, userId, risk, q, tag, from, to, archived, projFilter].join("|")}
            initialTasks={taskCards}
            archivedView={archivedView}
            users={users}
            showProjectName={isParent}
          />
        </div>
      )}
    </div>
  );
}
