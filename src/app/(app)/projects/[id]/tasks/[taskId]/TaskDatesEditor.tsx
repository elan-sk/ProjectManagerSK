"use client";

import { useTransition } from "react";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { useToast } from "@/components/Toast";
import { setTaskPlannedDates } from "../../actions";

// Fechas planeadas de la tarea: se eligen las dos (inicio y fin) en el mismo calendario del filtro de
// fechas, sin escribirlas a mano. Las reglas las valida setTaskPlannedDates.
export function TaskDatesEditor({ taskId, from, to, updatedAt }: { taskId: string; from: string; to: string; updatedAt: string }) {
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <span className={pending ? "pointer-events-none opacity-60" : ""}>
      <DateRangeFilter
        from={from}
        to={to}
        disableWeekends
        plain
        onSelect={(start, end) =>
          startTransition(async () => {
            const result = await setTaskPlannedDates(taskId, start, end, updatedAt).catch(() => null);
            if (!result?.ok) showToast(result?.error ?? "No se pudieron cambiar las fechas.");
          })
        }
      />
    </span>
  );
}
