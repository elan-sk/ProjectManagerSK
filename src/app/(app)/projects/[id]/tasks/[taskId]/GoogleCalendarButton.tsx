"use client";

import { useState, useTransition } from "react";
import { syncTaskToGoogleCalendar } from "./actions";

export function GoogleCalendarButton({ taskId, userId }: { taskId: string; userId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div>
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await syncTaskToGoogleCalendar(taskId, userId);
            setMessage(
              result.ok
                ? "Agregada a tu Google Calendar."
                : `No se pudo agregar: ${result.error}`
            );
          })
        }
        className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline disabled:opacity-50"
      >
        {pending ? "Agregando…" : "+ Agregar a Google Calendar"}
      </button>
      {message && <p className="mt-1 text-xs text-slate-500">{message}</p>}
    </div>
  );
}
