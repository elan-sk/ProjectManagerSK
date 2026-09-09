"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addObjective, updateObjective } from "./definitionActions";
import { useModalClose } from "@/components/Modal";

export function ObjectiveForm({
  projectId,
  objectiveId,
  currentTitle = "",
  currentDescription = null,
}: {
  projectId: string;
  objectiveId?: string;
  currentTitle?: string;
  currentDescription?: string | null;
}) {
  const router = useRouter();
  const onDone = useModalClose();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = objectiveId
            ? await updateObjective(objectiveId, formData)
            : await addObjective(projectId, formData);
          if (result.ok) {
            onDone();
            router.refresh();
          } else {
            setError(result.error ?? "No se pudo guardar.");
          }
        });
      }}
      className="space-y-3"
    >
      <div className="space-y-1">
        <label className="text-sm text-slate-600">Título</label>
        <input name="title" required autoFocus defaultValue={currentTitle} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div className="space-y-1">
        <label className="text-sm text-slate-600">Descripción (opcional)</label>
        <textarea
          name="description"
          rows={3}
          defaultValue={currentDescription ?? ""}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
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
