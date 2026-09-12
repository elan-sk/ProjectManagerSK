"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeSearchText } from "@/lib/search";

/**
 * Select con buscador para un <form> — mismo look/UX que ComboFilter
 * (autocomplete para listas que pueden crecer), pero en vez de navegar por
 * URL guarda la elección en un <input type="hidden"> para que viaje con el
 * resto del form al hacer submit.
 */
export function SearchableSelect({
  name,
  options,
  placeholder = "Elegir…",
  defaultValue,
  onChange,
}: {
  name: string;
  options: { id: string; label: string }[];
  placeholder?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const selected = options.find((o) => o.id === value);
  const filtered = query ? options.filter((o) => normalizeSearchText(o.label).includes(normalizeSearchText(query))) : options;

  function choose(id: string) {
    setValue(id);
    setOpen(false);
    setQuery("");
    onChange?.(id);
  }

  return (
    <div className="relative" ref={rootRef}>
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-left text-sm text-slate-900"
      >
        {selected ? selected.label : <span className="text-slate-400">{placeholder}</span>}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-2xl bg-white p-2 shadow-[0_4px_8px_rgba(15,23,42,0.08),0_16px_40px_rgba(15,23,42,0.12)]">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar…"
            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-slate-400"
          />
          <div className="mt-1 max-h-56 overflow-x-hidden overflow-y-auto">
            <button
              type="button"
              onClick={() => choose("")}
              className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-slate-50 ${!value ? "font-medium text-slate-900" : "text-slate-600"}`}
            >
              {placeholder}
            </button>
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => choose(o.id)}
                className={`block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-slate-50 ${value === o.id ? "font-medium text-slate-900" : "text-slate-600"}`}
              >
                {o.label}
              </button>
            ))}
            {filtered.length === 0 && <p className="px-2.5 py-1.5 text-xs text-slate-400">Sin resultados.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
