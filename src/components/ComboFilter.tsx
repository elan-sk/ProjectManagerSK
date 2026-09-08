"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Filtro con autocompletar: para listas que pueden crecer con el uso real
 * del producto (proyectos, personas) — a diferencia de un estado fijo de 4
 * valores, una fila de píldoras deja de ser usable a partir de unos pocos
 * proyectos/personas. Escribir filtra la lista; elegir navega.
 *
 * `basePath` + `currentParams` (datos planos, no una función — una función
 * no es serializable de Server a Client Component) son todo lo que necesita
 * para armar la URL él mismo, conservando el resto de los filtros activos.
 */
export function ComboFilter({
  allLabel,
  options,
  value,
  paramKey,
  basePath,
  currentParams,
}: {
  allLabel: string;
  options: { id: string; label: string }[];
  value: string | undefined;
  paramKey: string;
  basePath: string;
  currentParams: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  function buildHref(id: string | undefined) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(currentParams)) {
      if (v) p.set(k, v);
    }
    if (id) p.set(paramKey, id);
    else p.delete(paramKey);
    return `${basePath}?${p.toString()}`;
  }

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
  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  function choose(id: string | undefined) {
    setOpen(false);
    setQuery("");
    router.push(buildHref(id));
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`rounded-lg px-3 py-1.5 ${value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
      >
        {selected ? selected.label : allLabel}
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-64 rounded-2xl bg-white p-2 shadow-[0_4px_8px_rgba(15,23,42,0.08),0_16px_40px_rgba(15,23,42,0.12)]">
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
              onClick={() => choose(undefined)}
              className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-slate-50 ${!value ? "font-medium text-slate-900" : "text-slate-600"}`}
            >
              {allLabel}
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
