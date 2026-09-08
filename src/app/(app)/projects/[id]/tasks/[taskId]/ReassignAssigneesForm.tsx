"use client";

import { useState, useTransition } from "react";
import { setTaskAssignees } from "./actions";
import { useModalClose } from "@/components/Modal";

export function ReassignAssigneesForm({
  taskId,
  currentAssigneeIds,
  users,
}: {
  taskId: string;
  currentAssigneeIds: string[];
  users: { id: string; name: string }[];
}) {
  const onDone = useModalClose();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await setTaskAssignees(taskId, formData);
          if (result.ok) onDone();
          else setError(result.error ?? "No se pudo actualizar los asignados.");
        });
      }}
      className="space-y-3"
    >
      <div className="max-h-56 space-y-0.5 overflow-x-hidden overflow-y-auto">
        {users.map((u) => (
          <label key={u.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
            <input
              type="checkbox"
              name="assigneeIds"
              value={u.id}
              defaultChecked={currentAssigneeIds.includes(u.id)}
              className="rounded border-slate-300"
            />
            {u.name}
          </label>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        disabled={isPending}
        className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {isPending ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
