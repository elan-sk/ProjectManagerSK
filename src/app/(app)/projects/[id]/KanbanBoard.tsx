"use client";

import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { updateTaskStatus } from "./actions";
import { deleteTask } from "./tasks/[taskId]/actions";
import { archiveCompletedTasks, duplicateTask, mergeTasks, setTaskUrgent, unarchiveTask } from "./taskOps";
import { ReassignAssigneesForm } from "./tasks/[taskId]/ReassignAssigneesForm";
import { ModalTrigger } from "@/components/Modal";
import { AvatarGroup } from "@/components/Avatar";
import { ProjectIcon } from "@/components/ProjectIcon";
import { AlertBadge } from "@/components/AlertBadge";
import { ReferencePopover } from "@/components/ReferencePopover";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/Confirm";
import { PaperclipIcon, OverlapIcon, UrgentIcon, ArchiveIcon, CopyIcon, MergeIcon } from "@/components/icons";
import { TagChip } from "@/components/TagChip";
import { TASK_STATUS_LABEL, TASK_STATUS_COLOR, TASK_TYPE_LABEL as TYPE_LABEL, taskCardTint, isStartingSoon } from "@/lib/statusColors";
import type { TaskAlert } from "@/lib/delays";
import type { CollisionInfo } from "@/lib/collisions";
import type { TaskStatus } from "@prisma/client";

export type TaskCard = {
  id: string;
  projectId: string;
  projectName: string;
  projectIconUrl: string | null;
  title: string;
  type: string;
  // Urgente (la marcan Admin/PM): la card queda anclada arriba de su columna.
  isUrgent: boolean;
  /** Tarea archivada (completada que salió del flujo normal). */
  isArchived?: boolean;
  status: "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "RETURNED";
  riskLevel: string;
  // Punto 9: permiso de ESTA tarea puntual (según el proyecto al que
  // pertenece) — nunca un booleano único para todo el tablero, que en el
  // panorama general (varios proyectos mezclados) mostraba "Asignar" en
  // tareas de proyectos ajenos a quien mira.
  canManage: boolean;
  assignees: { name: string; avatarUrl: string | null }[];
  assigneeIds: string[];
  reviewers: { name: string; avatarUrl: string | null }[];
  tags: { id: string; name: string; colorHex: string; emoji: string | null }[];
  plannedStart: string;
  plannedEnd: string;
  stepsProgress: { done: number; total: number } | null;
  attachmentsCount: number;
  alert: TaskAlert;
  collidesWith: CollisionInfo[] | null;
  shareToken: string | null;
  // Punto 12: bloqueo optimista — se manda de vuelta en updateTaskStatus tal
  // cual se cargó, para que el servidor detecte si alguien más ya cambió
  // esta tarea desde entonces y no pisar ese cambio.
  updatedAt: string;
};

// RETURNED comparte columna con BLOCKED (misma columna "Bloqueada"): el
// revisor es el único que devuelve una tarea (reviewActions.ts), nunca se
// arrastra manualmente, así que no necesita columna propia — solo un badge
// en la card para distinguirla (ver CardBody).
const COLUMNS = (Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).filter((s) => s !== "RETURNED");

// Cambiar un filtro cambia los searchParams → la página se vuelve a
// renderizar con un set de tareas distinto → el `key` de KanbanBoard (más
// abajo) cambia y todo el tablero se remonta de cero, perdiendo el scroll
// vertical propio de cada columna (Column tiene su propio overflow-y-auto).
// Ese remount hace falta para que el estado interno recoja las tareas ya
// filtradas, así que en vez de evitarlo, la posición se guarda acá afuera
// (sobrevive al remount, no a un refresh de página — no hace falta más) y se
// restaura al montar cada columna. Con estado en memoria alcanza: no hace
// falta persistir entre sesiones.
const columnScrollPositions = new Map<string, number>();

const TYPE_BADGE: Record<string, string> = {
  SIMPLE: "bg-slate-100 text-slate-600",
  CHECKLIST: "bg-indigo-50 text-indigo-700",
  MILESTONE: "bg-violet-50 text-violet-700",
  MEETING: "bg-sky-50 text-sky-700",
  QA: "bg-teal-50 text-teal-700",
  ADJUSTMENT: "bg-orange-50 text-orange-700",
  ACCEPTANCE: "bg-pink-50 text-pink-700",
};

const RISK_DOT: Record<string, string> = {
  HIGH: "bg-red-500",
  MEDIUM: "bg-amber-500",
  LOW: "",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", timeZone: "UTC" });
}

// Clases visuales compartidas por la card "real" (dentro de la columna,
// arrastrable) y su copia en el DragOverlay (ver KanbanBoard) — así ambas se
// ven idénticas sin duplicar el string de Tailwind.
function cardClassName(task: TaskCard, extra: string) {
  // [&_button]/[&_a]:cursor-[inherit]: los controles internos (Asignar, Detalle…)
  // usan el mismo cursor de la card (manito; mano que agarra al presionar) en
  // vez del cursor por defecto de los botones.
  return `group relative touch-none space-y-2 rounded-2xl p-3.5 [&_a]:cursor-[inherit] [&_button]:cursor-[inherit] shadow-[0_1px_2px_rgba(15,23,42,0.06),0_1px_8px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_2px_4px_rgba(15,23,42,0.08),0_4px_16px_rgba(15,23,42,0.08)] ${task.isUrgent && task.status !== "COMPLETED" ? "bg-red-50 ring-2 ring-red-500/70" : taskCardTint(
    task.status,
    task.alert.level
  )} ${extra}`;
}

function CardBody({
  task,
  showProjectName,
  canManage,
  hideDelete = false,
  users,
  deleting,
  onDelete,
  onDuplicate,
  onToggleUrgent,
  selectMode = false,
  selected = false,
  collisionUrlBase,
}: {
  task: TaskCard;
  showProjectName: boolean;
  canManage: boolean;
  /** La copia que se ve mientras se arrastra no lleva el botón de eliminar. */
  hideDelete?: boolean;
  users: { id: string; name: string }[];
  deleting: boolean;
  onDelete: () => void;
  onDuplicate?: () => void;
  onToggleUrgent?: () => void;
  selectMode?: boolean;
  selected?: boolean;
  collisionUrlBase: string;
}) {
  const riskDot = RISK_DOT[task.riskLevel];
  const myCollisionsHref = `${collisionUrlBase}${collisionUrlBase.includes("?") ? "&" : "?"}collision=${task.id}`;

  return (
    <>
      {selectMode && (
        <span
          aria-hidden
          className={`absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded border-2 text-[11px] font-bold text-white ${selected ? "border-[#0a6b78] bg-[#0a6b78]" : "border-slate-300 bg-white"}`}
        >
          {selected ? "✓" : ""}
        </span>
      )}
      <div className="flex items-start justify-between gap-2 pr-7">
        <div className="flex flex-wrap items-center gap-1">
          <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${TYPE_BADGE[task.type]}`}>
            {TYPE_LABEL[task.type] ?? task.type}
          </span>
          {task.isArchived && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-200 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">
              <ArchiveIcon className="h-3 w-3" />
              Archivada
            </span>
          )}
          {task.status === "RETURNED" && (
            <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${TASK_STATUS_COLOR.RETURNED.badge}`}>
              {TASK_STATUS_LABEL.RETURNED}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-shrink-0 items-center gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
          {task.collidesWith && task.collidesWith.length > 0 && (
            <ReferencePopover
              trigger={<OverlapIcon className="h-3 w-3 text-indigo-500" />}
              hoverText={`Coincide en fechas con: ${task.collidesWith.map((c) => `${c.title} (${c.projectName})`).join(", ")}`}
              items={task.collidesWith.map((c) => ({
                id: c.taskId,
                label: `${c.title} (${c.projectName})`,
                href: `/projects/${c.projectId}/tasks/${c.taskId}`,
              }))}
              filteredHref={myCollisionsHref}
              filteredLabel="Ver mis colisiones"
              extraHref={`/collisions/${task.id}`}
              extraLabel="Ver detalle y alternativas"
              align="right"
            />
          )}
          {task.shareToken && <CopyLinkButton token={task.shareToken} />}
          {riskDot && (
            <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${riskDot}`} title={`Riesgo ${task.riskLevel}`} />
          )}
        </div>
      </div>

      {showProjectName && (
        <p className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
          <ProjectIcon name={task.projectName} iconUrl={task.projectIconUrl} size="h-3.5 w-3.5 text-[7px]" projectId={task.projectId} />
          {task.projectName}
        </p>
      )}
      <p className="text-sm font-medium leading-snug text-slate-900">{task.title}</p>

      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.tags.map((tag) => (
            <TagChip key={tag.id} colorHex={tag.colorHex} emoji={tag.emoji} name={tag.name} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        {fmtDate(task.plannedStart)} — {fmtDate(task.plannedEnd)}
        {task.alert.level === "onTrack" && ` · vence en ${task.alert.daysRemaining}d`}
      </p>

      {(task.alert.level === "overdue" || task.alert.level === "warning" || task.alert.level === "lateStart") && (
        <AlertBadge alert={task.alert} />
      )}

      {/* Preventivo (punto pedido por el usuario): solo para quien
          administra este proyecto — a un asignado normal no le suma nada
          saber cuántos días faltan para que arranque. */}
      {task.canManage && isStartingSoon(task.alert) && (
        <span className="inline-flex items-center rounded-md bg-cyan-50 px-1.5 py-0.5 text-[11px] font-medium text-cyan-700">
          Empieza en {task.alert.daysUntilStart}d
        </span>
      )}

      {task.stepsProgress && (
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{
                width: `${Math.round((task.stepsProgress.done / task.stepsProgress.total) * 100)}%`,
              }}
            />
          </div>
          <p className="text-[11px] text-slate-500">
            {task.stepsProgress.done}/{task.stepsProgress.total} pasos
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        {canManage ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <AvatarGroup people={task.assignees} />
            <ModalTrigger label="Asignar" title="Asignar tarea" variant="secondary" compact>
              <ReassignAssigneesForm taskId={task.id} currentAssigneeIds={task.assigneeIds} users={users} />
            </ModalTrigger>
            {task.type === "QA" && task.reviewers.length > 0 && (
              <div title="Revisor(es)" className="flex items-center gap-1 border-l border-slate-200 pl-1.5">
                <AvatarGroup people={task.reviewers} />
              </div>
            )}
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-1.5">
            <AvatarGroup people={task.assignees} />
            {task.type === "QA" && task.reviewers.length > 0 && (
              <div title="Revisor(es)" className="flex items-center gap-1 border-l border-slate-200 pl-1.5">
                <AvatarGroup people={task.reviewers} />
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          {task.attachmentsCount > 0 && (
            <span
              title={`${task.attachmentsCount} adjunto(s)`}
              className="flex items-center gap-0.5 text-xs text-slate-400"
            >
              <PaperclipIcon className="h-3.5 w-3.5" />
              {task.attachmentsCount}
            </span>
          )}
          <Link
            href={`/projects/${task.projectId}/tasks/${task.id}`}
            onPointerDown={(e) => e.stopPropagation()}
            className="text-xs font-medium text-slate-400 hover:text-slate-900"
          >
            Detalle
          </Link>
        </div>
      </div>

      {/* Acciones de Admin/PM en una sola línea, debajo de todo lo demás. */}
      {canManage && !hideDelete && !selectMode && (
        <div className="flex items-center gap-1 border-t border-black/5 pt-1.5 text-[11px] font-medium" onPointerDown={(e) => e.stopPropagation()}>
          {task.status !== "COMPLETED" && (
            <button
              type="button"
              onClick={onToggleUrgent}
              title={task.isUrgent ? "Quitar urgencia" : "Marcar como urgente"}
              className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 ${task.isUrgent ? "bg-red-600 text-white" : "text-slate-500 hover:bg-white/70 hover:text-red-600"}`}
            >
              <UrgentIcon className="h-3.5 w-3.5" />
              Urgente
            </button>
          )}
          <button type="button" onClick={onDuplicate} title="Duplicar tarea" className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-slate-500 hover:bg-white/70 hover:text-slate-900">
            <CopyIcon className="h-3.5 w-3.5" />
            Duplicar
          </button>
          <button type="button" onClick={onDelete} disabled={deleting} title="Eliminar tarea" className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-slate-500 hover:bg-white/70 hover:text-red-600">
            <TrashIcon className="h-3.5 w-3.5" />
            Eliminar
          </button>
        </div>
      )}

      {/* Quien no administra el proyecto ve el mismo indicador «Urgente», pero solo de lectura: no puede quitarlo. */}
      {!canManage && task.isUrgent && task.status !== "COMPLETED" && (
        <div className="flex items-center gap-1 border-t border-black/5 pt-1.5 text-[11px] font-medium">
          <span title="Tarea urgente — solo un administrador o el PM puede quitar la urgencia" className="flex items-center gap-1 rounded-md bg-red-600 px-1.5 py-0.5 text-white">
            <UrgentIcon className="h-3.5 w-3.5" />
            Urgente
          </span>
        </div>
      )}
    </>
  );
}

function Card({
  task,
  showProjectName,
  users,
  onDeleted,
  collisionUrlBase,
  selectMode,
  selected,
  onToggleSelect,
}: {
  task: TaskCard;
  showProjectName: boolean;
  users: { id: string; name: string }[];
  onDeleted: (taskId: string) => void;
  collisionUrlBase: string;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: (task: TaskCard) => void;
}) {
  const router = useRouter();
  const showToast = useToast();
  const confirm = useConfirm();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
  });
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    const ok = await confirm(`¿Seguro que querés eliminar la tarea "${task.title}"? No vas a poder deshacer esto.`, {
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    deleteTask(task.id).then((result) => {
      if (result.ok) {
        onDeleted(task.id);
        router.refresh();
      } else {
        setDeleting(false);
        showToast(result.error ?? "Ocurrió un error.");
      }
    });
  }

  async function handleDuplicate() {
    const result = await duplicateTask(task.id);
    if (result.ok) {
      showToast("Tarea duplicada.", "success");
      router.refresh();
    } else showToast(result.error);
  }

  async function handleToggleUrgent() {
    const result = await setTaskUrgent(task.id, !task.isUrgent);
    if (result.ok) {
      showToast(task.isUrgent ? "Se quitó la urgencia." : "Tarea marcada como urgente. Se avisó al equipo por WhatsApp.", "success");
      router.refresh();
    } else showToast(result.error);
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      // El arranque del arrastre va en la fase de captura (no burbujeo): así
      // también empieza desde "Asignar", "Detalle", etc., que frenan
      // onPointerDown para sí mismos. Un click sin mover nunca activa el
      // arrastre (sensor con `distance`), así que esos botones siguen
      // funcionando. Se ignora lo que llega de un modal portaleado (no es hijo
      // DOM de la card) para no arrastrar al usar el formulario de asignar.
      onPointerDownCapture={(e) => {
        if (e.currentTarget.contains(e.target as Node)) (listeners?.onPointerDown as ((ev: typeof e) => void) | undefined)?.(e);
      }}
      onClick={(e) => {
        // Click simple abre la tarea; el arrastre lo decide el sensor del
        // tablero (distance) y dnd-kit ya suprime el click que sigue a un
        // drag. Se ignoran clicks de controles internos (Detalle, eliminar,
        // popovers/modales que burbujean por portal) — solo el fondo de la
        // card navega.
        if (!e.currentTarget.contains(e.target as Node)) return;
        if (selectMode) return onToggleSelect(task);
        if ((e.target as HTMLElement).closest("a,button,input,select,textarea,label")) return;
        router.push(`/projects/${task.projectId}/tasks/${task.id}`);
      }}
      // dnd-kit numera aria-describedby con un contador de instancia que no
      // coincide entre el render del servidor y la hidratación del cliente
      // (problema conocido de la librería con SSR) — no afecta layout ni
      // función, solo el nombre accesible del elemento.
      suppressHydrationWarning
      // La card real ya no se traslada con `transform`: mientras se arrastra
      // queda oculta (opacity-0) y la copia visible es el DragOverlay de
      // KanbanBoard, que al portalearse a <body> siempre queda por delante de
      // cualquier columna, sin depender del overflow/stacking de cada una.
      // Cursor: manito que señala (pointer) al pasar por encima — un click
      // abre la tarea, como un link — y mano que agarra (grabbing) solo
      // mientras se mantiene presionado / se arrastra.
      className={cardClassName(task, isDragging ? "cursor-grabbing opacity-0" : deleting ? "cursor-pointer opacity-40" : "cursor-pointer active:cursor-grabbing")}
      // ponytail: content-visibility salta el render de cards fuera de vista
      // en columnas largas — carga progresiva sin librería de virtualización.
      // Alto variable (badges/tags/avatares), así que "auto Npx" reserva un
      // estimado hasta que el navegador recuerde el alto real ya visto.
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 160px" }}
    >
      <CardBody
        task={task}
        showProjectName={showProjectName}
        canManage={task.canManage}
        users={users}
        deleting={deleting}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
        onToggleUrgent={handleToggleUrgent}
        selectMode={selectMode}
        selected={selected}
        collisionUrlBase={collisionUrlBase}
      />
    </div>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14M4 6h16M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function Column({
  id,
  scrollKey,
  tasks,
  showProjectName,
  users,
  onDeleted,
  collisionUrlBase,
  archivedView,
  onArchived,
  selectMode,
  selectedIds,
  onToggleSelect,
}: {
  id: TaskCard["status"];
  scrollKey: string;
  tasks: TaskCard[];
  showProjectName: boolean;
  users: { id: string; name: string }[];
  onDeleted: (taskId: string) => void;
  collisionUrlBase: string;
  archivedView: boolean;
  onArchived: (taskIds: string[]) => void;
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (task: TaskCard) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const router = useRouter();
  const showToast = useToast();
  const confirm = useConfirm();
  // Las urgentes (sin completar) quedan ancladas arriba; el resto conserva su orden.
  const ordered = [...tasks].sort((a, b) => Number(b.isUrgent && b.status !== "COMPLETED") - Number(a.isUrgent && a.status !== "COMPLETED"));
  const archivable = id === "COMPLETED" ? tasks.filter((t) => t.canManage) : [];

  async function handleArchive() {
    const ok = await confirm(
      archivedView
        ? `¿Devolver ${archivable.length} tarea(s) archivada(s) al tablero?`
        : `¿Archivar ${archivable.length} tarea(s) completada(s)? Salen del tablero pero siguen en el historial y las consultas.`,
      { confirmLabel: archivedView ? "Desarchivar" : "Archivar" }
    );
    if (!ok) return;
    const results = await Promise.all(archivable.map((t) => (archivedView ? unarchiveTask(t.id) : Promise.resolve(null))));
    if (archivedView) {
      const failed = results.find((r) => r && !r.ok);
      if (failed && !failed.ok) return showToast(failed.error);
    } else {
      const result = await archiveCompletedTasks(archivable.map((t) => t.id));
      if (!result.ok) return showToast(result.error);
    }
    onArchived(archivable.map((t) => t.id));
    showToast(archivedView ? "Tareas devueltas al tablero." : "Tareas archivadas.", "success");
    router.refresh();
  }
  const color = TASK_STATUS_COLOR[id];
  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        if (el) el.scrollTop = columnScrollPositions.get(scrollKey) ?? 0;
      }}
      onScroll={(e) => columnScrollPositions.set(scrollKey, e.currentTarget.scrollTop)}
      className={`flex h-full min-w-0 flex-col overflow-y-auto rounded-2xl transition-colors ${
        isOver ? "bg-slate-200/70" : "bg-slate-100"
      }`}
    >
      <h3 className="sticky top-0 z-10 flex flex-shrink-0 items-center gap-1.5 bg-inherit px-4 py-3 text-sm font-semibold text-slate-700">
        <span className={`h-2 w-2 flex-shrink-0 rounded-full ${color.dot}`} />
        {TASK_STATUS_LABEL[id]}
        <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${color.badge}`}>
          {tasks.length}
        </span>
        {archivable.length > 0 && (
          <button
            type="button"
            onClick={handleArchive}
            title={archivedView ? "Devolver las tareas archivadas al tablero" : "Archivar las tareas completadas (siguen en el historial)"}
            className="ml-auto flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
          >
            <ArchiveIcon className="h-3.5 w-3.5" />
            {archivedView ? "Desarchivar" : "Archivar"}
          </button>
        )}
      </h3>
      <div className="flex flex-col gap-2.5 px-3 pb-3 pt-1.5">
        {ordered.map((t) => (
          <Card
            key={t.id}
            task={t}
            showProjectName={showProjectName}
            users={users}
            onDeleted={onDeleted}
            collisionUrlBase={collisionUrlBase}
            selectMode={selectMode}
            selected={selectedIds.has(t.id)}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </div>
    </div>
  );
}

export function KanbanBoard({
  initialTasks,
  showProjectName = false,
  users,
  collisionUrlBase = "/projects",
  archivedView = false,
}: {
  initialTasks: TaskCard[];
  /** Mostrando las tareas archivadas: la columna Completada permite devolverlas al tablero. */
  archivedView?: boolean;
  showProjectName?: boolean;
  users: { id: string; name: string }[];
  // Base para "Ver mis colisiones" del popover de cada tarea: la URL de la
  // vista actual (con sus filtros vigentes) sin el parámetro `collision` —
  // solo lo pasa /projects/page.tsx (panorama general), único lugar donde el
  // ícono de colisión llega a mostrarse (ver collidesWith siempre null en
  // /projects/[id]/page.tsx).
  collisionUrlBase?: string;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  // Tareas cuyo estado cambió acá: con un filtro activo el servidor deja de
  // devolverlas (ya no coinciden), pero se mantienen visibles hasta que el
  // usuario cambie los filtros (la página remonta el tablero con otro `key`).
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [prevInitial, setPrevInitial] = useState(initialTasks);
  if (initialTasks !== prevInitial) {
    setPrevInitial(initialTasks);
    const fromServer = new Set(initialTasks.map((t) => t.id));
    setTasks((prev) => {
      const local = new Map(prev.map((t) => [t.id, t]));
      // Una card movida acá manda sobre el servidor (que puede traerla con el
      // estado viejo mientras la confirmación/el guardado siguen en curso).
      const merged = initialTasks.map((t) => (pinnedIds.has(t.id) && local.has(t.id) ? { ...t, status: local.get(t.id)!.status } : t));
      return [...merged, ...prev.filter((t) => pinnedIds.has(t.id) && !fromServer.has(t.id))];
    });
  }
  const [activeTask, setActiveTask] = useState<TaskCard | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Con Ctrl (o ⌘) sostenido se ven las casillas y un clic selecciona; en cuanto hay una
  // seleccionada, las casillas y la barra de combinar quedan fijas hasta cancelar o combinar.
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const selectMode = ctrlHeld || selectedIds.size > 0;
  useEffect(() => {
    const sync = (e: KeyboardEvent) => setCtrlHeld(e.ctrlKey || e.metaKey);
    const off = () => setCtrlHeld(false);
    window.addEventListener("keydown", sync);
    window.addEventListener("keyup", sync);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("keydown", sync);
      window.removeEventListener("keyup", sync);
      window.removeEventListener("blur", off);
    };
  }, []);
  const [mergeTitle, setMergeTitle] = useState("");
  const [merging, setMerging] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const showToast = useToast();
  const confirm = useConfirm();
  const [, startTransition] = useTransition();
  // distance: sin esto dnd-kit trata cualquier pointerdown como inicio de
  // arrastre y el click nunca llega a abrir la tarea.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragStart(event: DragStartEvent) {
    setActiveTask(tasks.find((t) => t.id === event.active.id) ?? null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;
    const newStatus = over.id as TaskCard["status"];
    const draggedTask = tasks.find((t) => t.id === active.id);
    const previousStatus = draggedTask?.status;
    if (!previousStatus || previousStatus === newStatus) return;
    // La card se mueve de inmediato; para "Completada" además se pide
    // confirmación y, si se cancela, vuelve a su columna de origen.
    setPinnedIds((prev) => new Set(prev).add(draggedTask.id));
    setTasks((prev) =>
      prev.map((t) => (t.id === active.id ? { ...t, status: newStatus } : t))
    );
    if (newStatus === "COMPLETED") {
      const ok = await confirm(
        "Una vez que la marques como completada, no vas a poder subir más evidencia para esta tarea. ¿Querés continuar?",
        { confirmLabel: "Sí, completar" }
      );
      if (!ok) {
        setTasks((prev) =>
          prev.map((t) => (t.id === active.id ? { ...t, status: previousStatus } : t))
        );
        return;
      }
    }
    startTransition(async () => {
      // Punto 12: manda el updatedAt que este cliente tenía cargado — si
      // alguien más ya tocó la tarea desde entonces, el servidor rechaza en
      // vez de pisarlo (ver assertNotStale en actions.ts).
      const result = await updateTaskStatus(active.id as string, newStatus, draggedTask.updatedAt);
      if (!result.ok) {
        setTasks((prev) =>
          prev.map((t) => (t.id === active.id ? { ...t, status: previousStatus } : t))
        );
        showToast(result.error ?? "Ocurrió un error.");
        router.refresh();
      } else if (result.updatedAt) {
        setTasks((prev) => prev.map((t) => (t.id === active.id ? { ...t, updatedAt: result.updatedAt! } : t)));
      }
    });
  }

  function handleDeleted(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  function handleArchived(taskIds: string[]) {
    setTasks((prev) => prev.filter((t) => !taskIds.includes(t.id)));
  }

  // Combinar: solo tareas simples/entregables que el usuario administra, todas del mismo proyecto.
  function toggleSelect(task: TaskCard) {
    if (!task.canManage) return showToast("Solo el PM o un administrador puede combinar tareas.");
    if (task.type !== "SIMPLE" && task.type !== "MILESTONE") return showToast("Las tareas de Revisión, Ajuste y Aceptación no se pueden combinar.");
    const first = tasks.find((t) => selectedIds.has(t.id));
    if (first && first.projectId !== task.projectId) return showToast("Elegí tareas del mismo proyecto.");
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(task.id)) next.add(task.id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectedIds(new Set());
    setMergeTitle("");
  }

  async function handleMerge() {
    const ok = await confirm(
      `Se combinarán ${selectedIds.size} tareas en una sola: cada una pasa a ser un paso del checklist (si ya tenía checklist, sus pasos se suman), con sus comentarios y archivos reunidos. Las tareas originales se eliminan y no se puede deshacer.`,
      { confirmLabel: "Combinar", danger: true }
    );
    if (!ok) return;
    setMerging(true);
    const result = await mergeTasks([...selectedIds], mergeTitle);
    setMerging(false);
    if (!result.ok) return showToast(result.error);
    showToast("Tareas combinadas.", "success");
    exitSelectMode();
    router.refresh();
  }

  const canMerge = !archivedView && tasks.some((t) => t.canManage);

  return (
    // autoScroll desactivado: por defecto dnd-kit scrollea el contenedor más
    // cercano (cada columna, con overflow-y-auto) al arrastrar cerca de un
    // borde, lo que movía el tablero solo con empezar a arrastrar una card.
    <DndContext sensors={sensors} autoScroll={false} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {/* Alto fijo (mismo tratamiento que GanttView): el padre es sticky con
          altura calculada, "h-full" propaga ese alto a cada columna. El
          scroll vertical es de CADA columna por separado (ver Column más
          abajo), no de este contenedor — así "Completado" con 50 tareas no
          obliga a scrollear igual a "Bloqueado" con 2. */}
      <div className="flex h-full flex-col gap-2">
      {canMerge && selectedIds.size > 0 && (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 text-sm">
          <MergeIcon className="h-4 w-4 text-[#0a6b78]" />
          <span className="text-xs text-slate-600">{selectedIds.size} seleccionada(s){selectedIds.size < 2 ? " — elegí al menos una más (Ctrl + clic)" : ""}</span>
          {selectedIds.size >= 2 && (
            <>
              <input value={mergeTitle} onChange={(e) => setMergeTitle(e.target.value)} placeholder="Título de la tarea combinada" aria-label="Título de la tarea combinada" className="w-64 rounded-lg border border-slate-300 px-2.5 py-1 text-sm" />
              <button type="button" disabled={merging || !mergeTitle.trim()} onClick={handleMerge} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {merging ? "Combinando…" : "Combinar"}
              </button>
            </>
          )}
          <button type="button" onClick={exitSelectMode} className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            Cancelar selección
          </button>
        </div>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-visible pb-0 sm:grid-cols-2 lg:grid-cols-4">
        {COLUMNS.map((status) => (
          <Column
            key={status}
            id={status}
            scrollKey={`${pathname}:${status}`}
            tasks={tasks.filter((t) => t.status === status || (status === "BLOCKED" && t.status === "RETURNED"))}
            showProjectName={showProjectName}
            users={users}
            onDeleted={handleDeleted}
            collisionUrlBase={collisionUrlBase}
            archivedView={archivedView}
            onArchived={handleArchived}
            selectMode={selectMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
        ))}
      </div>
      </div>
      {/* Copia de la card en un portal a <body> (comportamiento nativo de
          DragOverlay): así siempre se ve por delante de cualquier columna
          mientras se arrastra, sin pelear con el overflow/stacking de cada
          Column (que antes la dejaba por detrás al cruzar a la columna
          vecina). */}
      <DragOverlay>
        {activeTask && (
          // Idéntica a la card real (incluido el botón "Asignar") y sin
          // inclinación: la copia queda exactamente bajo el cursor, sin
          // desplazamiento visual respecto al punto donde se agarró.
          <div className={cardClassName(activeTask, "cursor-grabbing shadow-lg")}>
            <CardBody
              task={activeTask}
              showProjectName={showProjectName}
              canManage={activeTask.canManage}
              users={users}
              deleting={false}
              onDelete={() => {}}
              collisionUrlBase={collisionUrlBase}
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
