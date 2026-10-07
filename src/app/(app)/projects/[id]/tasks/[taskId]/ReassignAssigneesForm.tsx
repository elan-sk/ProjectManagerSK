"use client";

import { useState, useTransition } from "react";
import { setTaskAssignees } from "./actions";
import { useModalClose } from "@/components/Modal";
import { UserCheckList } from "@/components/UserCheckList";

type SaveResult = { ok: true } | { ok: false; error?: string };

// Genérico: sirve tanto para asignar ejecutores (TaskAssignee) como
// revisores (TaskReviewer, punto 2.6) — misma UI, distinto campo y action.
export function ReassignAssigneesForm({
  taskId,
  currentAssigneeIds,
  users,
  action = setTaskAssignees,
  fieldName = "assigneeIds",
  errorFallback = "No se pudo actualizar los asignados.",
}: {
  taskId: string;
  currentAssigneeIds: string[];
  users: { id: string; name: string; avatarUrl?: string | null }[];
  action?: (taskId: string, formData: FormData) => Promise<SaveResult>;
  fieldName?: string;
  errorFallback?: string;
}) {
  const onDone = useModalClose();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await action(taskId, formData);
          if (result.ok) onDone();
          else setError(result.error ?? errorFallback);
        });
      }}
      className="space-y-3"
    >
      <UserCheckList users={users} fieldName={fieldName} defaultSelectedIds={currentAssigneeIds} />
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
