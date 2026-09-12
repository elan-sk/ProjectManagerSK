"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePhase } from "./definitionActions";
import { useModalClose } from "@/components/Modal";

export function PhaseForm({
  phaseId,
  currentName,
  requirements,
  currentRequirementIds,
}: {
  phaseId: string;
  currentName: string;
  requirements: { id: string; title: string }[];
  currentRequirementIds: string[];
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
          const result = await updatePhase(phaseId, formData);
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
        <label className="text-sm text-slate-600">Nombre</label>
        <input
          name="name"
          required
          autoFocus
          defaultValue={currentName}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm text-slate-600">Requerimientos que atiende (opcional)</label>
        {requirements.length === 0 ? (
          <p className="text-xs text-slate-400">Todavía no hay requerimientos creados en este proyecto.</p>
        ) : (
          <select name="requirementIds" multiple defaultValue={currentRequirementIds} className="h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {requirements.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        )}
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
