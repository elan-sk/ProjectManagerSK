"use client";

import { useState, useTransition } from "react";
import { reassignPM } from "./actions";
import { useModalClose } from "@/components/Modal";

export function ReassignPMForm({
  projectId,
  currentPmId,
  users,
}: {
  projectId: string;
  currentPmId: string;
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
          const result = await reassignPM(projectId, formData);
          if (result.ok) onDone();
          else setError(result.error ?? "No se pudo reasignar el PM.");
        });
      }}
      className="space-y-3"
    >
      <div className="space-y-1">
        <label className="text-sm text-slate-600">Nuevo Product Manager</label>
        <select name="pmId" defaultValue={currentPmId} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-400">
          El PM tiene control de administrador sobre este proyecto: puede crear/editar fases, tareas y dependencias.
        </p>
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
