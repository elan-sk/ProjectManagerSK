"use client";

import { useState, useTransition } from "react";
import { updateProjectRepoUrl } from "./actions";
import { useModalClose } from "@/components/Modal";

export function EditRepoUrlForm({ projectId, currentRepoUrl }: { projectId: string; currentRepoUrl: string | null }) {
  const onDone = useModalClose();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await updateProjectRepoUrl(projectId, formData);
          if (result.ok) onDone();
          else setError(result.error ?? "No se pudo actualizar el repositorio.");
        });
      }}
      className="space-y-3"
    >
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">URL del repositorio</span>
        <input
          type="url"
          name="repoUrl"
          defaultValue={currentRepoUrl ?? ""}
          placeholder="https://github.com/…"
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
