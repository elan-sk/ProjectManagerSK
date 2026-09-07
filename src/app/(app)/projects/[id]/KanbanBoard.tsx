"use client";

import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import Link from "next/link";
import { useState, useTransition } from "react";
import { updateTaskStatus } from "./actions";

export type TaskCard = {
  id: string;
  title: string;
  type: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";
  riskLevel: string;
  assignees: string[];
  stepsProgress: { done: number; total: number } | null;
};

const COLUMNS: { id: TaskCard["status"]; label: string }[] = [
  { id: "NOT_STARTED", label: "Sin iniciar" },
  { id: "IN_PROGRESS", label: "En curso" },
  { id: "BLOCKED", label: "Bloqueada" },
  { id: "COMPLETED", label: "Completada" },
];

const TYPE_LABEL: Record<string, string> = {
  SIMPLE: "Simple",
  CHECKLIST: "Checklist",
  MILESTONE: "Hito",
  MEETING: "Reunión",
  QA: "Prueba QA",
  ADJUSTMENT: "Ajuste",
};

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

const AVATAR_COLORS = [
  "bg-rose-600",
  "bg-blue-600",
  "bg-emerald-600",
  "bg-amber-600",
  "bg-violet-600",
  "bg-teal-600",
];

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function avatarColor(name: string) {
  const hash = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function Avatars({ names }: { names: string[] }) {
  if (names.length === 0) return <span className="text-xs text-slate-400">Sin asignar</span>;
  return (
    <div className="flex -space-x-1.5">
      {names.map((name) => (
        <span
          key={name}
          title={name}
          className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium text-white ring-2 ring-white ${avatarColor(name)}`}
        >
          {initials(name)}
        </span>
      ))}
    </div>
  );
}

function Card({ task, projectId }: { task: TaskCard; projectId: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  const riskDot = RISK_DOT[task.riskLevel];

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
      className={`touch-none cursor-grab space-y-2 rounded-2xl bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_1px_8px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_2px_4px_rgba(15,23,42,0.08),0_4px_16px_rgba(15,23,42,0.08)] ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${TYPE_BADGE[task.type]}`}>
          {TYPE_LABEL[task.type] ?? task.type}
        </span>
        {riskDot && (
          <span className={`mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full ${riskDot}`} title={`Riesgo ${task.riskLevel}`} />
        )}
      </div>

      <p className="text-sm font-medium leading-snug text-slate-900">{task.title}</p>

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

      <div className="flex items-center justify-between pt-1">
        <Avatars names={task.assignees} />
        <Link
          href={`/projects/${projectId}/tasks/${task.id}`}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-xs font-medium text-slate-400 hover:text-slate-900"
        >
          Detalle
        </Link>
      </div>
    </div>
  );
}

function Column({
  id,
  label,
  tasks,
  projectId,
}: {
  id: TaskCard["status"];
  label: string;
  tasks: TaskCard[];
  projectId: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 flex-shrink-0 flex-col gap-2.5 rounded-2xl p-3 transition-colors ${
        isOver ? "bg-slate-200/70" : "bg-slate-100"
      }`}
    >
      <h3 className="flex items-center gap-1.5 px-1 text-sm font-semibold text-slate-700">
        {label}
        <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
          {tasks.length}
        </span>
      </h3>
      <div className="flex flex-col gap-2.5">
        {tasks.map((t) => (
          <Card key={t.id} task={t} projectId={projectId} />
        ))}
      </div>
    </div>
  );
}

export function KanbanBoard({
  initialTasks,
  projectId,
}: {
  initialTasks: TaskCard[];
  projectId: string;
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

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <Column
            key={col.id}
            id={col.id}
            label={col.label}
            tasks={tasks.filter((t) => t.status === col.id)}
            projectId={projectId}
          />
        ))}
      </div>
    </DndContext>
  );
}
