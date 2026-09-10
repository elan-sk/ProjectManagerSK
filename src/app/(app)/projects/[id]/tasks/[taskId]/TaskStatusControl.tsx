"use client";

import { useState, useTransition } from "react";
import { updateTaskStatus } from "../../actions";
import { useConfirm } from "@/components/Confirm";
import { TASK_STATUS_LABEL, TASK_STATUS_COLOR } from "@/lib/statusColors";
import type { TaskStatus } from "@prisma/client";

const OPTIONS = Object.keys(TASK_STATUS_LABEL) as TaskStatus[];

export function TaskStatusControl({ taskId, status }: { taskId: string; status: TaskStatus }) {
  const confirm = useConfirm();
  const [current, setCurrent] = useState(status);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function change(next: TaskStatus) {
    if (next === current) return;
    if (next === "COMPLETED") {
      const ok = await confirm(
        "Una vez que la marques como completada, no vas a poder subir más evidencia para esta tarea. ¿Querés continuar?",
        { confirmLabel: "Sí, completar" }
      );
      if (!ok) return;
    }
    setError(null);
    const previous = current;
    setCurrent(next);
    startTransition(async () => {
      const result = await updateTaskStatus(taskId, next);
      if (!result.ok) {
        setCurrent(previous);
        setError(result.error ?? "No se pudo cambiar el estado.");
      }
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {OPTIONS.map((value) => (
          <button
            key={value}
            type="button"
            disabled={isPending}
            onClick={() => change(value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
              current === value ? `${TASK_STATUS_COLOR[value].solid} text-white` : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {TASK_STATUS_LABEL[value]}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
