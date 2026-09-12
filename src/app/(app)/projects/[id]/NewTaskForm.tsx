"use client";

import { useState, useTransition } from "react";
import { addTask } from "./actions";
import { CalendarDatePicker } from "@/components/CalendarDatePicker";
import { RichTextEditor } from "@/components/RichTextEditor";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useModalClose } from "@/components/Modal";
import { Avatar } from "@/components/Avatar";

// Punto 2 (unificación): checklist y link de reunión ahora son atributos de
// cualquier tarea, no tipos propios — ver TASK_TYPE_LABEL en statusColors.ts.
const TASK_TYPES = [
  { value: "SIMPLE", label: "Simple" },
  { value: "MILESTONE", label: "Entregable" },
  { value: "QA", label: "Revisión" },
  { value: "ADJUSTMENT", label: "Ajuste" },
];

export function NewTaskForm({
  projectId,
  phases,
  users,
  otherTasks,
}: {
  projectId: string;
  phases: { id: string; name: string }[];
  users: { id: string; name: string; avatarUrl?: string | null }[];
  otherTasks: { id: string; title: string; nextAvailableStart: string }[];
}) {
  const onDone = useModalClose();
  const [error, setError] = useState<string | null>(null);
  const [durationDays, setDurationDays] = useState(1);
  const [predecessorId, setPredecessorId] = useState("");
  const [isPending, startTransition] = useTransition();
  const selectedPredecessor = otherTasks.find((t) => t.id === predecessorId);

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await addTask(projectId, formData);
          if (result.ok) onDone();
          else setError(result.error ?? "No se pudo crear la tarea.");
        });
      }}
      className="space-y-3"
    >
      <div className="space-y-1">
        <label className="text-sm text-slate-600">Título</label>
        <input name="title" required autoFocus className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-sm text-slate-600">Fase</label>
          <select name="phaseId" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
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
      </div>

      <div className="grid grid-cols-2 gap-2">
        <CalendarDatePicker
          key={predecessorId || "none"}
          name="plannedStart"
          label="Fecha de inicio"
          previewDays={durationDays}
          defaultValue={selectedPredecessor?.nextAvailableStart.slice(0, 10)}
        />
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
        <label className="text-sm text-slate-600">Depende de (opcional)</label>
        <SearchableSelect
          name="predecessorId"
          placeholder="Ninguna"
          options={otherTasks.map((t) => ({ id: t.id, label: t.title }))}
          onChange={setPredecessorId}
        />
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
