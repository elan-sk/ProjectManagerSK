"use client";

import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
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

const RISK_BORDER: Record<string, string> = {
  HIGH: "border-l-red-500",
  MEDIUM: "border-l-amber-500",
  LOW: "border-l-slate-300",
};

function Card({ task, projectId }: { task: TaskCard; projectId: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`cursor-grab rounded-lg border border-l-4 border-slate-200 bg-white p-3 shadow-sm touch-none ${
        RISK_BORDER[task.riskLevel]
      } ${isDragging ? "opacity-50" : ""}`}
    >
      <p className="text-sm font-medium text-slate-900">{task.title}</p>
      <p className="mt-1 text-xs text-slate-500">
        {task.type} · {task.assignees.join(", ") || "Sin asignar"}
      </p>
      {task.stepsProgress && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full bg-emerald-500"
            style={{
              width: `${Math.round((task.stepsProgress.done / task.stepsProgress.total) * 100)}%`,
            }}
          />
        </div>
      )}
      <Link
        href={`/projects/${projectId}/tasks/${task.id}`}
        onPointerDown={(e) => e.stopPropagation()}
        className="mt-2 inline-block text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
      >
        Ver detalle →
      </Link>
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
      className={`flex w-72 flex-shrink-0 flex-col gap-2 rounded-xl border border-slate-200 p-3 ${
        isOver ? "bg-slate-100" : "bg-slate-50"
      }`}
    >
      <h3 className="text-sm font-semibold text-slate-700">
        {label} · {tasks.length}
      </h3>
      <div className="flex flex-col gap-2">
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

  // El servidor revalida esta página tras crear/mover tareas; sin este
  // efecto, el estado local quedaría pegado al valor con el que montó.
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

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
