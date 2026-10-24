"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { normalizeSearchText } from "@/lib/search";

/**
 * Select con buscador para un <form> — mismo look/UX que ComboFilter
 * (autocomplete para listas que pueden crecer), pero en vez de navegar por
 * URL guarda la elección en un <input type="hidden"> para que viaje con el
 * resto del form al hacer submit.
 * `allowCustom`: además de las opciones, acepta lo escrito («Usar «…»»); el valor es el texto mismo.
 */
export function SearchableSelect({
  name,
  options,
  placeholder = "Elegir…",
  defaultValue,
  onChange,
  allowCustom = false,
  searchPlaceholder = "Buscar…",
  className = "px-3 py-2 text-sm",
}: {
  name: string;
  /** `icon`: opcional, se muestra antes del nombre (p. ej. el ícono del proyecto). */
  options: { id: string; label: string; icon?: ReactNode }[];
  placeholder?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  allowCustom?: boolean;
  searchPlaceholder?: string;
  /** Tamaño y relleno del botón (por defecto el de los formularios). */
  className?: string;
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
  const custom = query.trim();
  const showCustom = allowCustom && custom !== "" && !options.some((o) => normalizeSearchText(o.label) === normalizeSearchText(custom));

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
        className={`w-full rounded-lg border border-slate-300 text-left text-slate-900 ${className}`}
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            {selected.icon}
            <span className="truncate">{selected.label}</span>
          </span>
        ) : allowCustom && value ? value : <span className="text-slate-400">{placeholder}</span>}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-2xl bg-white p-2 shadow-[0_4px_8px_rgba(15,23,42,0.08),0_16px_40px_rgba(15,23,42,0.12)]">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (filtered[0]) choose(filtered[0].id);
              else if (showCustom) choose(custom);
            }}
            placeholder={searchPlaceholder}
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
                className={`flex w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-slate-50 ${value === o.id ? "font-medium text-slate-900" : "text-slate-600"}`}
              >
                {o.icon}
                <span className="truncate">{o.label}</span>
              </button>
            ))}
            {showCustom && (
              <button
                type="button"
                onClick={() => choose(custom)}
                className="block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-sm font-medium text-[#0a6b78] hover:bg-slate-50"
              >
                Usar «{custom}»
              </button>
            )}
            {filtered.length === 0 && !showCustom && <p className="px-2.5 py-1.5 text-xs text-slate-400">Sin resultados.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
