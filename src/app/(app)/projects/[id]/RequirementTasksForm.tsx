"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setRequirementTasks } from "./definitionActions";
import { useModalClose } from "@/components/Modal";
import { normalizeSearchText } from "@/lib/search";

type PhaseTasks = { id: string; name: string; tasks: { id: string; title: string; requirementIds: string[] }[] };

export function RequirementTasksForm({
  requirementId,
  phases,
  requirementTitles,
}: {
  requirementId: string;
  phases: PhaseTasks[];
  requirementTitles: Record<string, string>;
}) {
  const router = useRouter();
  const onDone = useModalClose();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(
    () => new Set(phases.flatMap((p) => p.tasks.filter((t) => t.requirementIds.includes(requirementId)).map((t) => t.id)))
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visible = phases
    .map((p) => ({ ...p, tasks: query ? p.tasks.filter((t) => normalizeSearchText(t.title).includes(normalizeSearchText(query))) : p.tasks }))
    .filter((p) => p.tasks.length > 0);

  function toggle(ids: string[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await setRequirementTasks(requirementId, [...selected]);
        if (!result.ok) {
          setError(result.error ?? "No se pudieron guardar las tareas.");
          return;
        }
        onDone();
        router.refresh();
      } catch {
        setError("No se pudieron guardar las tareas. Conviene intentarlo de nuevo.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar tarea…"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <div className="max-h-[50vh] space-y-3 overflow-x-hidden overflow-y-auto">
        {visible.length === 0 && <p className="text-sm text-slate-400">{query ? "Sin resultados." : "El proyecto todavía no tiene tareas."}</p>}
        {visible.map((p) => {
          const ids = p.tasks.map((t) => t.id);
          const allChecked = ids.every((id) => selected.has(id));
          return (
            <fieldset key={p.id} className="space-y-0.5">
              <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50">
                <input type="checkbox" checked={allChecked} onChange={(e) => toggle(ids, e.target.checked)} />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="shrink-0 text-xs font-normal text-slate-400">marcar toda la fase</span>
              </label>
              {p.tasks.map((t) => {
                const others = t.requirementIds.filter((id) => id !== requirementId).map((id) => requirementTitles[id]);
                return (
                  <label key={t.id} className="flex items-start gap-2 rounded-lg py-1.5 pl-7 pr-2 text-sm text-slate-600 hover:bg-slate-50">
                    <input type="checkbox" className="mt-0.5" checked={selected.has(t.id)} onChange={(e) => toggle([t.id], e.target.checked)} />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words">{t.title}</span>
                      {others.length > 0 && (
                        <span className="block truncate text-xs text-slate-400" title={others.join("\n")}>
                          También en: {others.join(", ")}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          );
        })}
      </div>
      <p className="text-xs text-slate-500">
        {selected.size} {selected.size === 1 ? "tarea marcada" : "tareas marcadas"}
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={save}
        disabled={isPending}
        className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {isPending ? "Guardando…" : "Guardar"}
      </button>
    </div>
  );
}
