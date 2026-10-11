"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useModalClose } from "@/components/Modal";
import { normalizeSearchText } from "@/lib/search";
import { checkListArrowKeys } from "@/lib/checkListKeys";

export type TaskPickerPhase = { id: string; name: string; tasks: { id: string; title: string; note?: string | null }[] };

export function TaskPickerForm({
  phases,
  initialSelectedIds,
  lockedIds = [],
  onSave,
}: {
  phases: TaskPickerPhase[];
  initialSelectedIds: string[];
  lockedIds?: string[];
  onSave: (taskIds: string[]) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const onDone = useModalClose();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set(initialSelectedIds));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const lastClicked = useRef<string | null>(null);
  const shiftHeld = useRef(false);
  const uncheckHeld = useRef(false);
  const locked = new Set(lockedIds);

  const visible = phases
    .map((p) => ({ ...p, tasks: query ? p.tasks.filter((t) => normalizeSearchText(t.title).includes(normalizeSearchText(query))) : p.tasks }))
    .filter((p) => p.tasks.length > 0);
  const visibleIds = visible.flatMap((p) => p.tasks.map((t) => t.id));
  const freeVisibleIds = visibleIds.filter((id) => !locked.has(id));
  const allMarked = freeVisibleIds.length > 0 && freeVisibleIds.every((id) => selected.has(id));

  function setMany(ids: string[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (locked.has(id)) continue;
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function toggleTask(id: string, checked: boolean) {
    const shiftKey = shiftHeld.current;
    const uncheck = shiftKey && uncheckHeld.current;
    shiftHeld.current = false;
    uncheckHeld.current = false;
    const from = lastClicked.current ? visibleIds.indexOf(lastClicked.current) : -1;
    const to = visibleIds.indexOf(id);
    setMany(shiftKey && from >= 0 ? visibleIds.slice(Math.min(from, to), Math.max(from, to) + 1) : [id], uncheck ? false : checked);
    lastClicked.current = id;
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await onSave([...selected]);
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
      <div className="flex justify-end">
        {freeVisibleIds.length > 0 && (
          <button type="button" onClick={() => setMany(freeVisibleIds, !allMarked)} className="text-xs font-medium text-slate-500 hover:text-slate-900 hover:underline">
            {allMarked ? "Desmarcar todo" : "Marcar todo"}
          </button>
        )}
      </div>
      <div className="max-h-[50vh] space-y-3 overflow-x-hidden overflow-y-auto" onKeyDown={(e) => checkListArrowKeys(e, setMany)}>
        {visible.length === 0 && <p className="text-sm text-slate-400">{query ? "Sin resultados." : "El proyecto todavía no tiene tareas."}</p>}
        {visible.map((p) => {
          const ids = p.tasks.map((t) => t.id);
          const free = ids.filter((id) => !locked.has(id));
          return (
            <fieldset key={p.id} className="space-y-0.5">
              <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={ids.every((id) => selected.has(id))}
                  disabled={free.length === 0}
                  onChange={(e) => setMany(ids, e.target.checked)}
                />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {free.length > 0 && <span className="shrink-0 text-xs font-normal text-slate-400">marcar toda la fase</span>}
              </label>
              {p.tasks.map((t) => (
                <label
                  key={t.id}
                  onPointerDown={(e) => {
                    shiftHeld.current = e.shiftKey;
                    uncheckHeld.current = e.ctrlKey || e.metaKey;
                  }}
                  className="flex select-none items-start gap-2 rounded-lg py-1.5 pl-7 pr-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    data-id={t.id}
                    className="mt-0.5"
                    checked={selected.has(t.id)}
                    disabled={locked.has(t.id)}
                    onChange={(e) => toggleTask(t.id, e.target.checked)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words">{t.title}</span>
                    {t.note && (
                      <span className="block truncate text-xs text-slate-400" title={t.note}>
                        {t.note}
                      </span>
                    )}
                  </span>
                </label>
              ))}
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
