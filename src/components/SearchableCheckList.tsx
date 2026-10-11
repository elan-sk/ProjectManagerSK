"use client";

import { useRef, useState } from "react";
import { normalizeSearchText } from "@/lib/search";
import { checkListArrowKeys } from "@/lib/checkListKeys";

const SEARCH_FROM = 7;

export function SearchableCheckList({
  options,
  name,
  selectedIds,
  defaultSelectedIds,
  onChange,
  tall = false,
}: {
  options: { id: string; label: string }[];
  name?: string;
  selectedIds?: string[];
  defaultSelectedIds?: string[];
  onChange?: (ids: string[]) => void;
  tall?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [own, setOwn] = useState(defaultSelectedIds ?? []);
  const lastClicked = useRef<string | null>(null);
  const shiftHeld = useRef(false);
  const uncheckHeld = useRef(false);
  const selected = selectedIds ?? own;
  const filtered = query ? options.filter((o) => normalizeSearchText(o.label).includes(normalizeSearchText(query))) : options;

  function toggle(id: string, checked: boolean) {
    const shiftKey = shiftHeld.current;
    const mark = shiftKey && uncheckHeld.current ? false : checked;
    shiftHeld.current = false;
    uncheckHeld.current = false;
    const ids = filtered.map((o) => o.id);
    const from = lastClicked.current ? ids.indexOf(lastClicked.current) : -1;
    const to = ids.indexOf(id);
    const range = shiftKey && from >= 0 ? ids.slice(Math.min(from, to), Math.max(from, to) + 1) : [id];
    const next = mark ? [...selected, ...range.filter((x) => !selected.includes(x))] : selected.filter((x) => !range.includes(x));
    lastClicked.current = id;
    if (!selectedIds) setOwn(next);
    onChange?.(next);
  }

  function extend(ids: string[], checked: boolean) {
    const next = checked ? [...selected, ...ids.filter((x) => !selected.includes(x))] : selected.filter((x) => !ids.includes(x));
    if (!selectedIds) setOwn(next);
    onChange?.(next);
  }

  const filteredIds = filtered.map((o) => o.id);
  const allMarked = filteredIds.length > 0 && filteredIds.every((id) => selected.includes(id));

  return (
    <div className="space-y-1">
      {name && selected.map((id) => <input key={id} type="hidden" name={name} value={id} />)}
      {options.length >= SEARCH_FROM && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar…"
          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-400"
        />
      )}
      {filteredIds.length > 1 && (
        <div className="flex justify-end">
          <button type="button" onClick={() => extend(filteredIds, !allMarked)} className="text-xs font-medium text-slate-500 hover:text-slate-900 hover:underline">
            {allMarked ? "Desmarcar todo" : "Marcar todo"}
          </button>
        </div>
      )}
      <div className={`space-y-0.5 overflow-x-hidden overflow-y-auto ${tall ? "max-h-[50vh]" : "max-h-44"}`} onKeyDown={(e) => checkListArrowKeys(e, extend)}>
        {filtered.map((o) => (
          <label
            key={o.id}
            onPointerDown={(e) => {
              shiftHeld.current = e.shiftKey;
              uncheckHeld.current = e.ctrlKey || e.metaKey;
            }}
            className="flex select-none items-start gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            <input
              type="checkbox"
              data-id={o.id}
              className="mt-0.5"
              checked={selected.includes(o.id)}
              onChange={(e) => toggle(o.id, e.target.checked)}
            />
            <span className="min-w-0 break-words">{o.label}</span>
          </label>
        ))}
        {filtered.length === 0 && <p className="px-2 py-1.5 text-xs text-slate-400">Sin resultados.</p>}
      </div>
    </div>
  );
}
