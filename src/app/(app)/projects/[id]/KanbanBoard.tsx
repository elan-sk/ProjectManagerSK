"use client";

import { DndContext, DragOverlay, useDraggable, useDroppable, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { updateTaskStatus } from "./actions";
import { deleteTask } from "./tasks/[taskId]/actions";
import { ReassignAssigneesForm } from "./tasks/[taskId]/ReassignAssigneesForm";
import { ModalTrigger } from "@/components/Modal";
import { AvatarGroup } from "@/components/Avatar";
import { ProjectIcon } from "@/components/ProjectIcon";
import { AlertBadge } from "@/components/AlertBadge";
import { ReferencePopover } from "@/components/ReferencePopover";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/Confirm";
import { PaperclipIcon, OverlapIcon } from "@/components/icons";
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
  return `group relative touch-none space-y-2 rounded-2xl p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_1px_8px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_2px_4px_rgba(15,23,42,0.08),0_4px_16px_rgba(15,23,42,0.08)] ${taskCardTint(
    task.status,
    task.alert.level
  )} ${extra}`;
}

function CardBody({
  task,
  showProjectName,
  canManage,
  users,
  deleting,
  onDelete,
  collisionUrlBase,
}: {
  task: TaskCard;
  showProjectName: boolean;
  canManage: boolean;
  users: { id: string; name: string }[];
  deleting: boolean;
  onDelete: () => void;
  collisionUrlBase: string;
}) {
  const riskDot = RISK_DOT[task.riskLevel];
  const myCollisionsHref = `${collisionUrlBase}${collisionUrlBase.includes("?") ? "&" : "?"}collision=${task.id}`;

  return (
    <>
      {canManage && (
        <button
          type="button"
          onClick={onDelete}
          onPointerDown={(e) => e.stopPropagation()}
          disabled={deleting}
          aria-label="Eliminar tarea"
          className="absolute top-1.5 right-1.5 rounded-full bg-white/90 p-1 text-slate-400 opacity-0 shadow-sm hover:text-red-600 group-hover:opacity-100"
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      )}

      <div className="flex items-start justify-between gap-2 pr-7">
        <div className="flex flex-wrap items-center gap-1">
          <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${TYPE_BADGE[task.type]}`}>
            {TYPE_LABEL[task.type] ?? task.type}
          </span>
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
          <ProjectIcon name={task.projectName} iconUrl={task.projectIconUrl} size="h-3.5 w-3.5 text-[7px]" />
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
    </>
  );
}

function Card({
  task,
  showProjectName,
  users,
  onDeleted,
  collisionUrlBase,
}: {
  task: TaskCard;
  showProjectName: boolean;
  users: { id: string; name: string }[];
  onDeleted: (taskId: string) => void;
  collisionUrlBase: string;
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

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onDoubleClick={() => router.push(`/projects/${task.projectId}/tasks/${task.id}`)}
      // dnd-kit numera aria-describedby con un contador de instancia que no
      // coincide entre el render del servidor y la hidratación del cliente
      // (problema conocido de la librería con SSR) — no afecta layout ni
      // función, solo el nombre accesible del elemento.
      suppressHydrationWarning
      // La card real ya no se traslada con `transform`: mientras se arrastra
      // queda oculta (opacity-0) y la copia visible es el DragOverlay de
      // KanbanBoard, que al portalearse a <body> siempre queda por delante de
      // cualquier columna, sin depender del overflow/stacking de cada una.
      className={cardClassName(task, isDragging ? "cursor-grabbing opacity-0" : deleting ? "cursor-grab opacity-40" : "cursor-grab")}
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
}: {
  id: TaskCard["status"];
  scrollKey: string;
  tasks: TaskCard[];
  showProjectName: boolean;
  users: { id: string; name: string }[];
  onDeleted: (taskId: string) => void;
  collisionUrlBase: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
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
      </h3>
      <div className="flex flex-col gap-2.5 px-3 pb-3">
        {tasks.map((t) => (
          <Card
            key={t.id}
            task={t}
            showProjectName={showProjectName}
            users={users}
            onDeleted={onDeleted}
            collisionUrlBase={collisionUrlBase}
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
}: {
  initialTasks: TaskCard[];
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
  const [activeTask, setActiveTask] = useState<TaskCard | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const showToast = useToast();
  const confirm = useConfirm();
  const [, startTransition] = useTransition();

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
    if (newStatus === "COMPLETED") {
      const ok = await confirm(
        "Una vez que la marques como completada, no vas a poder subir más evidencia para esta tarea. ¿Querés continuar?",
        { confirmLabel: "Sí, completar" }
      );
      if (!ok) return;
    }

    setTasks((prev) =>
      prev.map((t) => (t.id === active.id ? { ...t, status: newStatus } : t))
    );
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
      }
    });
  }

  function handleDeleted(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  return (
    // autoScroll desactivado: por defecto dnd-kit scrollea el contenedor más
    // cercano (cada columna, con overflow-y-auto) al arrastrar cerca de un
    // borde, lo que movía el tablero solo con empezar a arrastrar una card.
    <DndContext autoScroll={false} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {/* Alto fijo (mismo tratamiento que GanttView): el padre es sticky con
          altura calculada, "h-full" propaga ese alto a cada columna. El
          scroll vertical es de CADA columna por separado (ver Column más
          abajo), no de este contenedor — así "Completado" con 50 tareas no
          obliga a scrollear igual a "Bloqueado" con 2. */}
      <div className="grid h-full grid-cols-1 gap-4 overflow-y-visible pb-0 sm:grid-cols-2 lg:grid-cols-4">
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
          />
        ))}
      </div>
      {/* Copia de la card en un portal a <body> (comportamiento nativo de
          DragOverlay): así siempre se ve por delante de cualquier columna
          mientras se arrastra, sin pelear con el overflow/stacking de cada
          Column (que antes la dejaba por detrás al cruzar a la columna
          vecina). */}
      <DragOverlay>
        {activeTask && (
          <div className={cardClassName(activeTask, "cursor-grabbing rotate-2 shadow-lg")}>
            <CardBody
              task={activeTask}
              showProjectName={showProjectName}
              canManage={false}
              users={[]}
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
