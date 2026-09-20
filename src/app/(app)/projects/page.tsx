import { auth } from "@/auth";
import { ComboFilter } from "@/components/ComboFilter";
import { OverlapIcon } from "@/components/icons";
import { SearchBox } from "@/components/SearchBox";
import { getAppCountryCode } from "@/lib/appSettings";
import { attachmentFileType, LINK_MIME_TYPE } from "@/lib/attachments";
import { rangeForMode, stepAnchor, utcDate, type CalendarMode } from "@/lib/calendarGrid";
import { findScheduleCollisions } from "@/lib/collisions";
import { getBottlenecks, getTaskAlert, matchesRiskFilter } from "@/lib/delays";
import { businessDaysRange } from "@/lib/holidays";
import { prisma } from "@/lib/prisma";
import { getProjectSummaryRows } from "@/lib/projectSummaries";
import { ATTRIBUTE_TYPE_OPTIONS, attributeTypeTriggerClass, hasUploadedFiles, isAttributeType, matchesAttributeType } from "@/lib/taskTypeFilter";
import { matchesTaskSearch, normalizeSearchText } from "@/lib/search";
import { TASK_STATUS_COLOR, TASK_STATUS_LABEL, TASK_TYPE_LABEL } from "@/lib/statusColors";
import { buildTagFilterOptions, matchesTagFilter } from "@/lib/tags";
import type { TaskStatus, TaskType } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RememberViewState } from "../RememberViewState";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { ResetFiltersButton } from "@/components/ResetFiltersButton";
import { matchesDateRange, parseDayKey } from "@/lib/dateRange";
import { GanttView, type GanttTask } from "./[id]/GanttView";
import { KanbanBoard, type TaskCard } from "./[id]/KanbanBoard";
import { ProjectCalendarView, type CalendarTask } from "./[id]/ProjectCalendarView";
import { AllProjectsFilesView } from "./AllProjectsFilesView";
import { ProjectSummaryGrid } from "./ProjectSummaryGrid";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    risk?: "overdue" | "warning" | "lateStart" | "startingSoon";
    view?: string;
    date?: string;
    mode?: string;
    status?: TaskStatus;
    type?: TaskType | "RETURNED_MINE" | "REVIEWING_MINE" | "NEW" | "WITH_FILES" | "SHARED";
    userId?: string;
    q?: string;
    tag?: string;
    from?: string;
    to?: string;
    collision?: string;
    pid?: string;
    health?: "ok" | "warn" | "bad";
    fileKind?: string;
    fileType?: string;
    fileProject?: string;
    fileQ?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { risk, view, date, mode, status, type, userId, q, tag, from: fromParam, to: toParam, collision, pid, health, fileKind, fileType, fileProject, fileQ } = await searchParams;
  const from = parseDayKey(fromParam);
  const to = parseDayKey(toParam);

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
      type,
      userId,
      q,
      tag,
      from,
      to,
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

  // Base de "Ver mis colisiones" (popover de cada tarea): la vista actual
  // con sus filtros vigentes, pero sin el `collision` de la URL — el popover
  // le agrega el id de SU tarea encima, a diferencia de "Solo colisiones"
  // (arriba, collision="1") que muestra TODAS las tareas con alguna colisión.
  const collisionUrlBase = boardHref({ collision: undefined });

  const [projects, users, allTasksForCollisions, activeShareLinks, tagCategories] = await Promise.all([
    // Liviano a propósito: pm/tasks (salud, progreso, alertas) ya los trae
    // getProjectSummaryRows por su cuenta — acá solo hace falta lo que
    // alimenta la vista Archivos del panorama general y el selector "Buscar".
    prisma.project.findMany({
      // Un proyecto oculto solo lo ve el administrador.
      where: { status: { not: "ARCHIVED" }, ...(isAdmin ? {} : { hidden: false }) },
      include: {
        // Insumos del proyecto cargados en Definición (repositorio de
        // archivos + links de referencia) — se mezclan más abajo con los
        // adjuntos de tarea en la vista Archivos del panorama general.
        attachments: { orderBy: { uploadedAt: "asc" } },
        links: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.task.findMany({
      where: { archivedAt: null, ...(isAdmin ? {} : { project: { hidden: false } }) },
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
    // Un link activo a la vez por proyecto/tarea (createShareLink revoca el
    // anterior) — alimenta tanto el indicador de copiar-en-un-clic (tarjetas
    // de proyecto, Kanban, Gantt) como el listado en la vista Archivos. Sin
    // filtrar por boardWhere a propósito: nunca se expone salvo para un
    // proyecto/tarea que ya pasó ese filtro más abajo.
    prisma.shareLink.findMany({
      where: { revokedAt: null },
      select: { targetType: true, projectId: true, taskId: true, token: true },
    }),
    prisma.tagCategory.findMany({ orderBy: { name: "asc" } }),
  ]);
  const projectShareTokenById = new Map(
    activeShareLinks.filter((l) => l.targetType === "PROJECT").map((l) => [l.projectId!, l.token])
  );
  const taskShareTokenById = new Map(
    activeShareLinks.filter((l) => l.targetType === "TASK").map((l) => [l.taskId!, l.token])
  );

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

  // Punto 9: un miembro sin proyectos propios (no admin, no PM de ninguno)
  // no debe ver en la lista proyectos donde no tiene ni una tarea asignada
  // — antes veía TODOS los proyectos de la app, con o sin asignación.
  const myAssignedProjectIds = isAdmin || isPM
    ? null
    : new Set(
        (
          await prisma.task.findMany({
            where: { assignees: { some: { userId: session.user.id } } },
            select: { projectId: true },
            distinct: ["projectId"],
          })
        ).map((t) => t.projectId)
      );

  // "Vista resumen" (card de proyecto con salud/progreso/alertas) — misma
  // función que usa el bloque "Mis proyectos" de Agenda (ver
  // projectSummaries.ts), reusando acá el `collisionsById` ya calculado
  // arriba para el Panorama general en vez de volver a escanear todas las
  // tareas del sistema. El filtro Buscar/Alerta (pid/health) vive dentro de
  // ProjectSummaryGrid; acá solo se acota QUÉ proyectos entran.
  const projectRows = await getProjectSummaryRows(
    {
      status: { not: "ARCHIVED" },
      ...(isAdmin ? {} : { hidden: false }),
      ...(myAssignedProjectIds ? { id: { in: [...myAssignedProjectIds] } } : {}),
    },
    canSeeCollisions,
    collisionsById
  );

  // --- Panorama general: tablero/Gantt/calendario de TODOS los proyectos
  // visibles para este usuario (según sus "superpoderes" de arriba), pensado
  // para detectar de un vistazo actividades que chocan entre proyectos.
  const boardWhere = isAdmin
    ? {}
    : isPM
    ? { projectId: { in: myPmProjectIds! } }
    : { assignees: { some: { userId: session.user.id } } };

  const boardTasksRaw = await prisma.task.findMany({
    // Las tareas archivadas salen del flujo visual; las de proyectos ocultos, para quien no es admin.
    where: { ...boardWhere, archivedAt: null, ...(isAdmin ? {} : { project: { hidden: false } }) },
    include: {
      project: { select: { id: true, name: true, countryCode: true, startDate: true, color: true, iconUrl: true } },
      phase: { select: { name: true } },
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
    orderBy: { plannedStart: "asc" },
  });

  const boardProjectIds = [...new Set(boardTasksRaw.map((t) => t.projectId))];
  // Etiquetas del filtro "Etiqueta": solo las ya usadas en algún proyecto
  // visible en este panorama (mismo criterio que projects/[id]/page.tsx, acá
  // agregado a través de todos los boardProjectIds).
  const boardTags =
    boardProjectIds.length > 0
      ? await prisma.tag.findMany({ where: { projectId: { in: boardProjectIds } }, select: { id: true, categoryId: true, name: true } })
      : [];
  const boardBottlenecks = (await Promise.all(boardProjectIds.map((id) => getBottlenecks(id)))).flat();
  const boardBottleneckReasonById = new Map(boardBottlenecks.map((t) => [t.id, t.bottleneckReason]));

  const boardAlertById = new Map(
    await Promise.all(boardTasksRaw.map(async (t) => [t.id, await getTaskAlert(t.project.countryCode, t)] as const))
  );
  // "Solo colisiones" (collision="1", toggle de arriba): cualquier tarea con
  // alguna colisión. "Ver mis colisiones" (collision=<taskId>, desde el
  // popover de una tarea puntual): solo esa tarea y las que choca con ella.
  const myCollisionTaskIds =
    collision && collision !== "1"
      ? new Set([collision, ...(collisionsById.get(collision) ?? []).map((c) => c.taskId)])
      : null;
  const myUserId = session.user.id;
  // Igual criterio que en la página de un proyecto puntual: "Devueltas"/
  // "Revisión" son personales, no un TaskType real — atajos sobre los mismos
  // datos que ya alimentan las alertas fijas del header.
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
    if (type === "RETURNED_MINE") return t.status === "RETURNED" && t.assignees.some((a) => a.userId === myUserId);
    if (type === "REVIEWING_MINE") {
      return t.reviewers.some((r) => r.userId === myUserId) && t.reviewRounds.some((r) => r.outcome === null);
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
  const matchesBoardFilters = (t: {
    id: string;
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
    matchesRiskFilter(boardAlertById.get(t.id)!, risk) &&
    matchesDateRange(t, from, to) &&
    matchesType(t) &&
    (!userId || t.assignees.some((a) => a.userId === userId)) &&
    matchesTagFilter(tag, t.taskTags) &&
    (!collision || (myCollisionTaskIds ? myCollisionTaskIds.has(t.id) : Boolean(collisionsById.get(t.id)))) &&
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

  // Punto 9: "Asignar"/eliminar en el panorama general no puede depender de
  // un único booleano para TODO el tablero (bug real: un PM de un proyecto
  // veía el botón hasta en tareas de otros proyectos donde no administra
  // nada) — cada card/barra lleva su propio permiso, según a QUÉ proyecto
  // pertenece esa tarea puntual.
  const canManageProject = (projectId: string) => isAdmin || Boolean(myPmProjectIds?.includes(projectId));

  const boardTaskCards: TaskCard[] = boardTasksRaw
    .filter(matchesBoardFilters)
    .map((t) => ({
      id: t.id,
      projectId: t.projectId,
      projectName: t.project.name,
      projectIconUrl: t.project.iconUrl,
      title: t.title,
      type: t.type,
      isUrgent: t.isUrgent,
      status: t.status,
      riskLevel: t.riskLevel,
      canManage: canManageProject(t.projectId),
      updatedAt: t.updatedAt.toISOString(),
      assignees: t.assignees.map((a) => ({ name: a.user.name, avatarUrl: a.user.avatarUrl })),
      assigneeIds: t.assignees.map((a) => a.userId),
      reviewers: t.reviewers.map((r) => ({ name: r.user.name, avatarUrl: r.user.avatarUrl })),
      tags: t.taskTags.map((tt) => ({ id: tt.tagId, name: tt.tag.name, colorHex: tt.tag.category.colorHex, emoji: tt.tag.category.emoji })),
      plannedStart: t.plannedStart.toISOString(),
      plannedEnd: t.plannedEnd.toISOString(),
      stepsProgress:
        t.steps.length > 0 ? { done: t.steps.filter((s) => s.done).length, total: t.steps.length } : null,
      attachmentsCount: t.attachments.length,
      alert: boardAlertById.get(t.id)!,
      collidesWith: canSeeCollisions ? collisionsById.get(t.id) ?? null : null,
      shareToken: taskShareTokenById.get(t.id) ?? null,
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
        isUrgent: t.isUrgent,
        phaseId: t.phaseId,
        phaseName: t.phase.name,
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
        alert: boardAlertById.get(t.id)!,
        bottleneckReason: boardBottleneckReasonById.get(t.id) ?? null,
        collidesWith: canSeeCollisions ? collisionsById.get(t.id) ?? null : null,
        assignees: t.assignees.map((a) => ({ name: a.user.name, avatarUrl: a.user.avatarUrl })),
        reviewers: t.reviewers.map((r) => ({ name: r.user.name, avatarUrl: r.user.avatarUrl })),
        tags: t.taskTags.map((tt) => ({ id: tt.tagId, name: tt.tag.name, colorHex: tt.tag.category.colorHex, emoji: tt.tag.category.emoji })),
        shareToken: taskShareTokenById.get(t.id) ?? null,
      };
    });

  const boardCalendarTasks: CalendarTask[] = boardTasksRaw
    .filter(matchesBoardFilters)
    .map((t) => ({
      id: t.id,
      projectId: t.projectId,
      projectName: t.project.name,
      title: t.title,
      isUrgent: t.isUrgent,
      attachmentsCount: t.attachments.length,
      shareToken: taskShareTokenById.get(t.id) ?? null,
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
  // Ausente = "Todos" (nuevo default); solo "INSUMO"/"RESULTADO" acotan a una
  // de las dos pestañas.
  const boardFileKind: "INSUMO" | "RESULTADO" | undefined =
    fileKind === "RESULTADO" ? "RESULTADO" : fileKind === "INSUMO" ? "INSUMO" : undefined;
  // Mismo scope de visibilidad que boardSharedLinks más abajo: solo
  // proyectos con alguna tarea que este usuario ya puede ver (boardWhere) —
  // se calcula antes porque boardProjectFiles también lo necesita.
  const boardVisibleProjectIds = new Set(boardTasksRaw.map((t) => t.projectId));
  // Insumos cargados en Definición (repositorio de archivos + links de
  // referencia) de cada proyecto visible — sin tarea propia, por eso antes
  // no aparecían acá (pedido explícito del usuario: deben poder
  // buscarse/verse en el panorama general igual que en la vista de un
  // proyecto puntual).
  const boardProjectFiles =
    boardFileKind === "RESULTADO"
      ? []
      : projects
          .filter((p) => boardVisibleProjectIds.has(p.id) && (!fileProject || p.id === fileProject))
          .flatMap((p) => [
            ...p.attachments.map((a) => ({ ...a, taskId: null, taskTitle: null, projectId: p.id, projectName: p.name })),
            ...p.links.map((l) => ({
              id: l.id,
              fileUrl: l.url,
              fileName: l.title,
              mimeType: LINK_MIME_TYPE,
              taskId: null,
              taskTitle: null,
              projectId: p.id,
              projectName: p.name,
            })),
          ]);
  const boardFiles = boardTasksRaw
    .flatMap((t) =>
      t.attachments
        .filter((a) => !boardFileKind || a.kind === boardFileKind)
        .map((a) => ({
          id: a.id,
          fileUrl: a.fileUrl,
          fileName: a.fileName,
          mimeType: a.mimeType,
          taskId: t.id as string | null,
          taskTitle: t.title as string | null,
          projectId: t.projectId,
          projectName: t.project.name,
        }))
    )
    .concat(boardProjectFiles)
    .filter((a) => !fileType || fileType === "all" || attachmentFileType(a.mimeType) === fileType)
    .filter((a) => !fileProject || a.projectId === fileProject)
    .filter((a) => !fileQ || normalizeSearchText(a.fileName).includes(normalizeSearchText(fileQ)));
  const boardSharedLinks = [
    ...projects
      .filter((p) => boardVisibleProjectIds.has(p.id) && (!fileProject || p.id === fileProject))
      .map((p) => {
        const token = projectShareTokenById.get(p.id);
        return token ? { id: `project:${p.id}`, label: `Proyecto — ${p.name}`, token, href: `/projects/${p.id}` } : null;
      })
      .filter((l): l is { id: string; label: string; token: string; href: string } => l !== null),
    ...boardTasksRaw
      .filter((t) => !fileProject || t.projectId === fileProject)
      .map((t) => {
        const token = taskShareTokenById.get(t.id);
        return token
          ? { id: `task:${t.id}`, label: `Tarea — ${t.title} (${t.project.name})`, token, href: `/projects/${t.projectId}/tasks/${t.id}` }
          : null;
      })
      .filter((l): l is { id: string; label: string; token: string; href: string } => l !== null),
  ].filter((l) => !fileQ || normalizeSearchText(l.label).includes(normalizeSearchText(fileQ)));
  const boardFileProjectOptions = Array.from(new Map(boardTasksRaw.map((t) => [t.projectId, t.project.name])).entries()).map(
    ([id, label]) => ({ id, label })
  );

  return (
    <div className="space-y-8">
      <RememberViewState storageKey="projectsBoard" excludeParams={["pid", "health"]} />
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">Proyectos</h1>
        </div>

        <ProjectSummaryGrid
          rows={projectRows}
          basePath="/projects"
          pid={pid}
          health={health}
          currentParams={{}}
          users={users}
          projectShareTokenById={projectShareTokenById}
        />
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
          <div className="flex flex-wrap items-start gap-x-5 gap-y-3 text-sm mb-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">Buscar</span>
              <SearchBox
                basePath="/projects"
                q={q}
                hiddenParams={{ from, to, risk, view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), status, type, userId, tag, collision }}
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
                currentParams={{ from, to, risk, view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), status, type, q, tag, collision }}
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
                currentParams={{ from, to, risk, view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), userId, type, q, tag, collision }}
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
                  ...ATTRIBUTE_TYPE_OPTIONS,
                ]}
                paramKey="type"
                basePath="/projects"
                currentParams={{ from, to, risk, view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), userId, status, q, tag, collision }}
                triggerColorClass={attributeTypeTriggerClass(type)}
              />
            </div>
            {boardTags.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Etiqueta</span>
                <ComboFilter
                  allLabel="Todas las etiquetas"
                  value={tag}
                  options={buildTagFilterOptions(tagCategories, boardTags)}
                  paramKey="tag"
                  basePath="/projects"
                  currentParams={{ from, to, risk, view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), userId, status, type, q, collision }}
                />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">Alerta</span>
              <ComboFilter
                allLabel="Todas las alertas"
                value={risk}
                options={[
                  // Preventivo — solo para quien administra el panorama general.
                  ...(canManageBoard ? [{ id: "startingSoon", label: "Empieza pronto", dotColorClass: "bg-cyan-500" }] : []),
                  { id: "lateStart", label: "Inicio retrasado", dotColorClass: "bg-blue-400" },
                  { id: "warning", label: "Por vencer", dotColorClass: "bg-amber-500" },
                  { id: "overdue", label: "Final retrasado", dotColorClass: "bg-red-500" },
                ]}
                paramKey="risk"
                basePath="/projects"
                currentParams={{ from, to, view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), userId, status, type, q, tag, collision }}
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
                basePath="/projects"
                currentParams={{ risk, view, mode: calendarMode !== "month" ? calendarMode : undefined, date: anchorKey(anchor), status, type, userId, q, tag, collision }}
              />
            </div>
            {canSeeCollisions && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Colisión</span>
                <Link
                  href={boardHref({ collision: collision ? undefined : "1" })}
                  scroll={false}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${collision ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  <OverlapIcon className="h-3.5 w-3.5" />
                  Solo colisiones
                </Link>
              </div>
            )}
            <ResetFiltersButton
              count={[q, userId, status, type, tag, risk, collision, from || to].filter(Boolean).length}
              href={boardHref({ status: undefined, type: undefined, userId: undefined, risk: undefined, q: undefined, tag: undefined, collision: undefined, from: undefined, to: undefined })}
            />
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
            sharedLinks={boardSharedLinks}
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
          <div className="sticky-view-panel-gantt sticky top-[57px] h-[calc(100vh-150px)]">
            <GanttView
              businessDays={boardBusinessDays}
              tasks={boardGanttTasks}
              canManage={canManageBoard}
              users={users}
              collisionUrlBase={collisionUrlBase}
              focusCollision={Boolean(collision && collision !== "1")}
            />
          </div>
        ) : view === "calendar" ? (
          <ProjectCalendarView
            tasks={boardCalendarTasks}
            mode={calendarMode}
            anchor={anchor}
            showProjectName
            collisionUrlBase={collisionUrlBase}
          />
        ) : (
          <div className="sticky-view-panel-kanban sticky top-[57px] h-[calc(100vh-150px)]">
            <KanbanBoard
              // Solo cambia con los filtros: las cards movidas de estado siguen
              // visibles hasta que se toquen los filtros (ver KanbanBoard).
              key={[risk, status, type, userId, q, tag, collision, from, to].join("|")}
              initialTasks={boardTaskCards}
              showProjectName
              users={users}
              collisionUrlBase={collisionUrlBase}
            />
          </div>
        )}
      </section>
    </div>
  );
}
