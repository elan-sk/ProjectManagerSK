"use client";

import { useState } from "react";
import { normalizeSearchText } from "@/lib/search";

const SEARCH_FROM = 7;

export function SearchableCheckList({
  options,
  name,
  selectedIds,
  defaultSelectedIds,
  onToggle,
}: {
  options: { id: string; label: string }[];
  name?: string;
  selectedIds?: string[];
  defaultSelectedIds?: string[];
  onToggle?: (id: string, checked: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [own, setOwn] = useState(defaultSelectedIds ?? []);
  const selected = selectedIds ?? own;
  const filtered = query ? options.filter((o) => normalizeSearchText(o.label).includes(normalizeSearchText(query))) : options;

  function toggle(id: string, checked: boolean) {
    if (!selectedIds) setOwn((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
    onToggle?.(id, checked);
  }

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
      <div className="max-h-44 space-y-0.5 overflow-x-hidden overflow-y-auto">
        {filtered.map((o) => (
          <label key={o.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            <input type="checkbox" className="mt-0.5" checked={selected.includes(o.id)} onChange={(e) => toggle(o.id, e.target.checked)} />
            <span className="min-w-0 break-words">{o.label}</span>
          </label>
        ))}
        {filtered.length === 0 && <p className="px-2 py-1.5 text-xs text-slate-400">Sin resultados.</p>}
      </div>
    </div>
  );
}
