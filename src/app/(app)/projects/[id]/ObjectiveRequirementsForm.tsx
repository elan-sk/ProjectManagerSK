"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setObjectiveRequirements } from "./definitionActions";
import { useModalClose } from "@/components/Modal";
import { SearchableCheckList } from "@/components/SearchableCheckList";

export function ObjectiveRequirementsForm({
  objectiveId,
  requirements,
  currentRequirementIds,
}: {
  objectiveId: string;
  requirements: { id: string; title: string }[];
  currentRequirementIds: string[];
}) {
  const router = useRouter();
  const onDone = useModalClose();
  const [selected, setSelected] = useState(currentRequirementIds);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await setObjectiveRequirements(objectiveId, selected);
        if (!result.ok) {
          setError(result.error ?? "No se pudieron guardar los requerimientos.");
          return;
        }
        onDone();
        router.refresh();
      } catch {
        setError("No se pudieron guardar los requerimientos. Conviene intentarlo de nuevo.");
      }
    });
  }

  return (
    <div className="space-y-3">
      {requirements.length === 0 ? (
        <p className="text-sm text-slate-400">Todavía no hay requerimientos creados en este proyecto.</p>
      ) : (
        <SearchableCheckList
          tall
          options={requirements.map((r) => ({ id: r.id, label: r.title }))}
          selectedIds={selected}
          onChange={setSelected}
        />
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={save}
        disabled={isPending}
        className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {isPending ? "Guardando…" : "Guardar"}
      </button>
    </div>
  );
}
