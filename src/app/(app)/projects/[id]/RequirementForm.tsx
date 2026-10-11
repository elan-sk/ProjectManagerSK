"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addRequirement, updateRequirement } from "./definitionActions";
import { SearchableCheckList } from "@/components/SearchableCheckList";
import { useModalClose } from "@/components/Modal";

export function RequirementForm({
  projectId,
  objectives,
  requirementId,
  currentTitle = "",
  currentDescription = null,
  currentObjectiveIds = [],
}: {
  projectId: string;
  objectives: { id: string; title: string }[];
  requirementId?: string;
  currentTitle?: string;
  currentDescription?: string | null;
  currentObjectiveIds?: string[];
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
          const result = requirementId
            ? await updateRequirement(requirementId, formData)
            : await addRequirement(projectId, formData);
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
      <div className="space-y-1">
        <label className="text-sm text-slate-600">Objetivos que atiende (opcional)</label>
        {objectives.length === 0 ? (
          <p className="text-xs text-slate-400">Todavía no hay objetivos creados en este proyecto.</p>
        ) : (
          <SearchableCheckList name="objectiveIds" options={objectives.map((o) => ({ id: o.id, label: o.title }))} defaultSelectedIds={currentObjectiveIds} />
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
