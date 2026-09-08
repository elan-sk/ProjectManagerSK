"use client";

import { useState, useTransition } from "react";
import { updateProjectStartDate } from "./actions";
import { CalendarDatePicker } from "@/components/CalendarDatePicker";
import { useModalClose } from "@/components/Modal";

export function EditStartDateForm({ projectId, currentStartDate }: { projectId: string; currentStartDate: string }) {
  const onDone = useModalClose();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await updateProjectStartDate(projectId, formData);
          if (result.ok) onDone();
          else setError(result.error ?? "No se pudo actualizar la fecha.");
        });
      }}
      className="space-y-3"
    >
      <CalendarDatePicker name="startDate" label="Fecha de inicio del proyecto" defaultValue={currentStartDate} />
      <p className="text-xs text-slate-400">
        Cambiar esta fecha recalcula automáticamente todo el rango de días hábiles del Gantt.
      </p>
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
