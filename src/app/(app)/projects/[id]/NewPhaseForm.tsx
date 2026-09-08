"use client";

import { useState, useTransition } from "react";
import { addPhase } from "./actions";
import { useModalClose } from "@/components/Modal";

export function NewPhaseForm({ projectId }: { projectId: string }) {
  const onDone = useModalClose();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await addPhase(projectId, formData);
          if (result.ok) onDone();
          else setError(result.error ?? "No se pudo crear la fase.");
        });
      }}
      className="space-y-3"
    >
      <div className="space-y-1">
        <label className="text-sm text-slate-600">Nombre de la fase</label>
        <input
          name="name"
          required
          autoFocus
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        disabled={isPending}
        className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {isPending ? "Creando…" : "Crear fase"}
      </button>
    </form>
  );
}
