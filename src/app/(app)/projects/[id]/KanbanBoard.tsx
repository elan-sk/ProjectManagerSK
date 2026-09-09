"use client";

import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateTaskStatus } from "./actions";
import { deleteTask } from "./tasks/[taskId]/actions";
import { ReassignAssigneesForm } from "./tasks/[taskId]/ReassignAssigneesForm";
import { ModalTrigger } from "@/components/Modal";
import { AvatarGroup } from "@/components/Avatar";
import { ProjectIcon } from "@/components/ProjectIcon";
import { AlertBadge } from "@/components/AlertBadge";
import { ReferencePopover } from "@/components/ReferencePopover";
import { PaperclipIcon, OverlapIcon } from "@/components/icons";
import { TASK_STATUS_LABEL, TASK_STATUS_COLOR, TASK_TYPE_LABEL as TYPE_LABEL, taskCardTint } from "@/lib/statusColors";
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
  status: "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";
  riskLevel: string;
  assignees: { name: string; avatarUrl: string | null }[];
  assigneeIds: string[];
  plannedStart: string;
  plannedEnd: string;
  stepsProgress: { done: number; total: number } | null;
  attachmentsCount: number;
  alert: TaskAlert;
  collidesWith: CollisionInfo[] | null;
};

const COLUMNS = Object.keys(TASK_STATUS_LABEL) as TaskStatus[];

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

function Card({
  task,
  showProjectName,
  canManage,
  users,
  onDeleted,
}: {
  task: TaskCard;
  showProjectName: boolean;
  canManage: boolean;
  users: { id: string; name: string }[];
  onDeleted: (taskId: string) => void;
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  const [deleting, setDeleting] = useState(false);
  // El transform del drag crea su propio contexto de apilamiento, así que sin
  // z-index explícito la card queda por detrás de la columna siguiente al
  // arrastrarla entre columnas. Por debajo de z-10 a propósito: el
  // encabezado sticky de cada columna debe quedar siempre visible, incluso
  // tapando a una card en pleno arrastre.
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 5 }
    : undefined;
  const riskDot = RISK_DOT[task.riskLevel];

  function handleDelete() {
    if (!confirm(`¿Eliminar la tarea "${task.title}"? Esta acción no se puede deshacer.`)) return;
    setDeleting(true);
    deleteTask(task.id).then((result) => {
      if (result.ok) {
        onDeleted(task.id);
        router.refresh();
      } else {
        setDeleting(false);
        alert(result.error);
      }
    });
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      // dnd-kit numera aria-describedby con un contador de instancia que no
      // coincide entre el render del servidor y la hidratación del cliente
      // (problema conocido de la librería con SSR) — no afecta layout ni
      // función, solo el nombre accesible del elemento.
      suppressHydrationWarning
      className={`group relative touch-none cursor-grab space-y-2 rounded-2xl p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_1px_8px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_2px_4px_rgba(15,23,42,0.08),0_4px_16px_rgba(15,23,42,0.08)] ${taskCardTint(
        task.status,
        task.alert.level
      )} ${isDragging ? "opacity-50" : deleting ? "opacity-40" : ""}`}
    >
      {canManage && (
        <button
          type="button"
          onClick={handleDelete}
          onPointerDown={(e) => e.stopPropagation()}
          disabled={deleting}
          aria-label="Eliminar tarea"
          className="absolute top-1.5 right-1.5 rounded-full bg-white/90 p-1 text-slate-400 opacity-0 shadow-sm hover:text-red-600 group-hover:opacity-100"
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      )}

      <div className="flex items-start justify-between gap-2 pr-4">
        <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${TYPE_BADGE[task.type]}`}>
          {TYPE_LABEL[task.type] ?? task.type}
        </span>
        <div className="mt-1 flex flex-shrink-0 items-center gap-1.5">
          {task.collidesWith && task.collidesWith.length > 0 && (
            <ReferencePopover
              trigger={<OverlapIcon className="h-3 w-3 text-indigo-500" />}
              hoverText={`Coincide en fechas con: ${task.collidesWith.map((c) => `${c.title} (${c.projectName})`).join(", ")}`}
              items={task.collidesWith.map((c) => ({
                id: c.taskId,
                label: `${c.title} (${c.projectName})`,
                href: `/projects/${c.projectId}/tasks/${c.taskId}`,
              }))}
              filteredHref="/projects?collision=1"
              filteredLabel="Ver todas las colisiones"
              align="right"
            />
          )}
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

      <p className="text-[11px] text-slate-400">
        {fmtDate(task.plannedStart)} — {fmtDate(task.plannedEnd)}
        {task.alert.level === "onTrack" && ` · vence en ${task.alert.daysRemaining}d`}
      </p>

      {(task.alert.level === "overdue" || task.alert.level === "warning") && (
        <AlertBadge alert={task.alert} />
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
          </div>
        ) : (
          <AvatarGroup people={task.assignees} />
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
  tasks,
  showProjectName,
  canManage,
  users,
  onDeleted,
}: {
  id: TaskCard["status"];
  tasks: TaskCard[];
  showProjectName: boolean;
  canManage: boolean;
  users: { id: string; name: string }[];
  onDeleted: (taskId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const color = TASK_STATUS_COLOR[id];
  return (
    <div
      ref={setNodeRef}
      className={`flex h-full w-72 flex-shrink-0 flex-col overflow-y-auto rounded-2xl transition-colors ${
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
          <Card key={t.id} task={t} showProjectName={showProjectName} canManage={canManage} users={users} onDeleted={onDeleted} />
        ))}
      </div>
    </div>
  );
}

export function KanbanBoard({
  initialTasks,
  showProjectName = false,
  canManage,
  users,
}: {
  initialTasks: TaskCard[];
  showProjectName?: boolean;
  canManage: boolean;
  users: { id: string; name: string }[];
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [, startTransition] = useTransition();

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const newStatus = over.id as TaskCard["status"];
    const previousStatus = tasks.find((t) => t.id === active.id)?.status;
    if (!previousStatus || previousStatus === newStatus) return;

    setTasks((prev) =>
      prev.map((t) => (t.id === active.id ? { ...t, status: newStatus } : t))
    );
    startTransition(async () => {
      const result = await updateTaskStatus(active.id as string, newStatus);
      if (!result.ok) {
        setTasks((prev) =>
          prev.map((t) => (t.id === active.id ? { ...t, status: previousStatus } : t))
        );
        alert(result.error);
      }
    });
  }

  function handleDeleted(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      {/* Alto fijo (mismo tratamiento que GanttView): el padre es sticky con
          altura calculada, "h-full" propaga ese alto a cada columna. El
          scroll vertical es de CADA columna por separado (ver Column más
          abajo), no de este contenedor — así "Completado" con 50 tareas no
          obliga a scrollear igual a "Bloqueado" con 2. */}
      <div className="flex h-full gap-4 overflow-x-auto overflow-y-visible pb-4">
        {COLUMNS.map((status) => (
          <Column
            key={status}
            id={status}
            tasks={tasks.filter((t) => t.status === status)}
            showProjectName={showProjectName}
            canManage={canManage}
            users={users}
            onDeleted={handleDeleted}
          />
        ))}
      </div>
    </DndContext>
  );
}
