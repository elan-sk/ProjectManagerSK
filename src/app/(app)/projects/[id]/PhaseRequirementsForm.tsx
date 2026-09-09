"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePhaseRequirements } from "./definitionActions";
import { useModalClose } from "@/components/Modal";

export function PhaseRequirementsForm({
  phaseId,
  requirements,
  currentRequirementIds,
}: {
  phaseId: string;
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
          const result = await updatePhaseRequirements(phaseId, formData);
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
      {requirements.length === 0 ? (
        <p className="text-sm text-slate-400">Todavía no hay requerimientos creados en este proyecto.</p>
      ) : (
        <select name="requirementIds" multiple defaultValue={currentRequirementIds} className="h-32 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          {requirements.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
      )}
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
