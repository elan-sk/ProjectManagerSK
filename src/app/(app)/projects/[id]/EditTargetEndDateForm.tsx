"use client";

import { useState, useTransition } from "react";
import { updateProjectTargetEndDate } from "./actions";
import { CalendarDatePicker } from "@/components/CalendarDatePicker";
import { useModalClose } from "@/components/Modal";

export function EditTargetEndDateForm({
  projectId,
  currentTargetEndDate,
}: {
  projectId: string;
  currentTargetEndDate: string | null;
}) {
  const onDone = useModalClose();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await updateProjectTargetEndDate(projectId, formData);
          if (result.ok) onDone();
          else setError(result.error ?? "No se pudo actualizar la fecha.");
        });
      }}
      className="space-y-3"
    >
      <CalendarDatePicker
        name="targetEndDate"
        label="Fecha de cierre comprometida"
        defaultValue={currentTargetEndDate ?? undefined}
      />
      <p className="text-xs text-slate-400">
        Deadline del proyecto (ej. compromiso con el cliente) — se dibuja como línea en el Gantt. No se recalcula
        solo: no tiene relación con las fechas planeadas de las tareas.
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
