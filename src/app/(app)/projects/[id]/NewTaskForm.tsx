"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addTask } from "./actions";
import { CalendarDatePicker } from "@/components/CalendarDatePicker";
import { RichTextEditor } from "@/components/RichTextEditor";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useModalClose } from "@/components/Modal";
import { Avatar } from "@/components/Avatar";
import { TASK_TYPE_LABEL } from "@/lib/statusColors";
import { NewTaskTagsPicker } from "./NewTaskTagsPicker";

// Punto 2 (unificación): checklist y link de reunión ahora son atributos de
// cualquier tarea, no tipos propios — ver TASK_TYPE_LABEL en statusColors.ts.
// Se deriva de ahí (no una lista propia) para que renombrar un tipo no quede
// desincronizado entre este formulario y el resto de la app.
const TASK_TYPES = (["SIMPLE", "MILESTONE", "QA", "ADJUSTMENT"] as const).map((value) => ({
  value,
  label: TASK_TYPE_LABEL[value],
}));

// Bug real: sin "Depende de" elegido, el picker no tenía ningún defaultValue
// y arrancaba vacío — el `required` de su <input type="hidden"> no lo frena
// (los navegadores ignoran `required` en inputs ocultos), así que si el
// usuario no tocaba el calendario a mano, se mandaba plannedStart="" y el
// servidor tiraba un ZodError feo en vez de un error claro. "Hoy" es el
// default más razonable para "nueva tarea" (misma zona horaria que ya usa
// GanttView para "Hoy" en el propio Gantt).
function todayInBogota() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

export function NewTaskForm({
  projectId,
  phases,
  users,
  otherTasks,
  templates,
  tagCategories,
  projectTagNamesByCategory,
}: {
  projectId: string;
  phases: { id: string; name: string }[];
  users: { id: string; name: string; avatarUrl?: string | null }[];
  otherTasks: { id: string; title: string; nextAvailableStart: string }[];
  templates: { id: string; name: string }[];
  tagCategories: { id: string; name: string; colorHex: string; emoji: string | null }[];
  projectTagNamesByCategory: Record<string, string[]>;
}) {
  const onDone = useModalClose();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [durationDays, setDurationDays] = useState(1);
  const [predecessorId, setPredecessorId] = useState("");
  const [type, setType] = useState(TASK_TYPES[0].value as string);
  const [isPending, startTransition] = useTransition();
  const selectedPredecessor = otherTasks.find((t) => t.id === predecessorId);

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await addTask(projectId, formData);
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
          <select
            name="type"
            required
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
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
          defaultValue={selectedPredecessor?.nextAvailableStart.slice(0, 10) ?? todayInBogota()}
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

      {type === "QA" && (
        <>
          <div className="space-y-1">
            <label className="text-sm text-slate-600">Revisor(es)</label>
            <div className="max-h-36 space-y-0.5 overflow-y-auto rounded-lg border border-slate-300 p-1">
              {users.map((u) => (
                <label key={u.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                  <input type="checkbox" name="reviewerIds" value={u.id} className="rounded border-slate-300" />
                  <Avatar name={u.name} avatarUrl={u.avatarUrl} size="h-6 w-6 text-[10px]" />
                  {u.name}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-slate-600">Plantilla de pruebas (opcional)</label>
            <select name="defaultTestTemplateId" defaultValue="" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Ninguna por ahora</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {tagCategories.length > 0 && (
        <NewTaskTagsPicker categories={tagCategories} projectTagNamesByCategory={projectTagNamesByCategory} />
      )}

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
