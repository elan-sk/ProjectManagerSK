"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { insertAdjacentTask } from "./actions";
import { CalendarDatePicker } from "@/components/CalendarDatePicker";
import { RichTextEditor } from "@/components/RichTextEditor";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useModalClose } from "@/components/Modal";
import { Avatar } from "@/components/Avatar";
import { TASK_TYPE_LABEL } from "@/lib/statusColors";

const TASK_TYPES = (["SIMPLE", "MILESTONE", "QA", "ADJUSTMENT"] as const).map((value) => ({
  value,
  label: TASK_TYPE_LABEL[value],
}));

// Mismo bug y mismo arreglo que NewTaskForm: sin defaultValue el picker
// arranca vacío y, si el usuario no lo toca, se manda plannedStart="" —
// el servidor ahora lo rechaza con un mensaje claro (safeParse), pero es
// mejor que ni siquiera pase eso: "hoy" es el default razonable.
function todayInBogota() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

// Formulario de "Crear predecesor"/"Crear sucesor" del menú contextual del
// Gantt (ver GanttView.tsx): a diferencia de NewTaskForm, la fase y el
// vínculo con la tarea de origen ya los determina la propia acción, así que
// acá se muestran fijos (no como inputs) en vez de repetir esa elección. En
// "Crear predecesor" la nueva tarea se inserta EN MEDIO de la cadena (si
// origin ya tenía predecesora, esa pasa a serlo de la nueva) — ese vínculo
// sí se expone editable porque no lo fija la acción en sí.
export function InsertAdjacentTaskForm({
  projectId,
  originTaskId,
  role,
  phaseName,
  originTitle,
  users,
  phaseTasks,
  currentPredecessorId,
}: {
  projectId: string;
  originTaskId: string;
  role: "predecessor" | "successor";
  phaseName: string;
  originTitle: string;
  users: { id: string; name: string; avatarUrl?: string | null }[];
  phaseTasks: { id: string; title: string }[];
  currentPredecessorId?: string;
}) {
  const onDone = useModalClose();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [durationDays, setDurationDays] = useState(1);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await insertAdjacentTask(originTaskId, role, formData);
          if (result.ok) {
            onDone();
            router.push(`/projects/${projectId}/tasks/${result.id}`);
          } else {
            setError(result.error ?? "No se pudo crear la tarea.");
          }
        });
      }}
      className="space-y-3"
    >
      <div className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
        <p>
          Fase: <span className="font-medium text-slate-900">{phaseName}</span>
        </p>
        {role === "successor" ? (
          <p>
            Depende de: <span className="font-medium text-slate-900">{originTitle}</span>
          </p>
        ) : (
          <p>
            Precederá a: <span className="font-medium text-slate-900">{originTitle}</span>{" "}
            <span className="text-xs text-slate-500">(quedará como su nueva dependencia)</span>
          </p>
        )}
      </div>

      {role === "predecessor" && (
        <div className="space-y-1">
          <label className="text-sm text-slate-600">Depende de (opcional)</label>
          <SearchableSelect
            name="predecessorId"
            placeholder="Ninguna"
            options={phaseTasks.map((t) => ({ id: t.id, label: t.title }))}
            defaultValue={currentPredecessorId}
          />
        </div>
      )}

      <div className="space-y-1">
        <label className="text-sm text-slate-600">Título</label>
        <input name="title" required autoFocus className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>

      <div className="space-y-1">
        <label className="text-sm text-slate-600">Tipo</label>
        <select name="type" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          {TASK_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <CalendarDatePicker name="plannedStart" label="Fecha de inicio" previewDays={durationDays} defaultValue={todayInBogota()} />
        <div className="space-y-1">
          <label className="text-sm text-slate-600">Días hábiles</label>
          <input
            type="number"
            name="durationDays"
            min={1}
            value={durationDays}
            onChange={(e) => setDurationDays(Math.max(1, Number(e.target.value) || 1))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm text-slate-600">Descripción</label>
        <RichTextEditor name="description" defaultValue={null} />
      </div>

      <div className="space-y-1">
        <label className="text-sm text-slate-600">Asignados</label>
        <div className="max-h-36 space-y-0.5 overflow-y-auto rounded-lg border border-slate-300 p-1">
          {users.map((u) => (
            <label key={u.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
              <input type="checkbox" name="assigneeIds" value={u.id} className="rounded border-slate-300" />
              <Avatar name={u.name} avatarUrl={u.avatarUrl} size="h-6 w-6 text-[10px]" />
              {u.name}
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        disabled={isPending}
        className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {isPending ? "Creando…" : "Crear tarea"}
      </button>
    </form>
  );
}
