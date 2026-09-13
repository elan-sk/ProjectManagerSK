"use client";

import { useState, useTransition } from "react";
import { updateProjectName } from "./actions";
import { useModalClose } from "@/components/Modal";

export function EditProjectNameForm({ projectId, currentName }: { projectId: string; currentName: string }) {
  const onDone = useModalClose();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await updateProjectName(projectId, formData);
          if (result.ok) onDone();
          else setError(result.error ?? "No se pudo actualizar el nombre.");
        });
      }}
      className="space-y-3"
    >
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Nombre del proyecto</span>
        <input
          type="text"
          name="name"
          defaultValue={currentName}
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
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
