"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTaskMeetingUrl } from "./actions";

/**
 * Punto 2.4: link de reunión (Meet/Zoom/Teams) — el día es el de la propia
 * tarea; meetingAtLocal es la hora exacta (input datetime-local ya en hora
 * de Bogotá, ver utcToBogotaLocalInputValue) usada para el recordatorio 30
 * min antes por WhatsApp.
 */
export function InlineMeetingUrl({
  taskId,
  meetingUrl,
  meetingAtLocal,
  canManage,
}: {
  taskId: string;
  meetingUrl: string | null;
  meetingAtLocal: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!editing) {
    if (!meetingUrl) {
      if (!canManage) return null;
      return (
        <button type="button" onClick={() => setEditing(true)} className="text-sm text-slate-400 hover:text-slate-600 hover:underline">
          + Agregar link de reunión
        </button>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <a href={meetingUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-slate-900 hover:underline">
          🔗 Unirse a la reunión
        </a>
        {meetingAtLocal && <span className="text-xs text-slate-500">{formatLocalTime(meetingAtLocal)}</span>}
        {canManage && (
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-slate-400 hover:text-slate-600 hover:underline">
            Editar
          </button>
        )}
      </div>
    );
  }

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await updateTaskMeetingUrl(taskId, formData);
          if (result.ok) {
            setEditing(false);
            router.refresh();
          } else {
            setError(result.error ?? "No se pudo guardar.");
          }
        });
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        type="url"
        name="meetingUrl"
        defaultValue={meetingUrl ?? ""}
        placeholder="https://meet.google.com/…"
        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
      />
      <input
        type="datetime-local"
        name="meetingAt"
        defaultValue={meetingAtLocal ?? ""}
        title="Hora de inicio (para el recordatorio 30 min antes por WhatsApp)"
        className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
      />
      <button disabled={isPending} className="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
        Guardar
      </button>
      <button type="button" disabled={isPending} onClick={() => setEditing(false)} className="shrink-0 text-sm text-slate-500 hover:text-slate-900">
        Cancelar
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </form>
  );
}

function formatLocalTime(datetimeLocal: string) {
  const [, hour, minute] = /T(\d{2}):(\d{2})$/.exec(datetimeLocal) ?? [];
  if (!hour) return "";
  const h = Number(hour);
  const period = h < 12 ? "a.m." : "p.m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${minute} ${period}`;
}
