"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFixedBelow } from "@/components/AnchoredPopover";
import { CheckIcon, EyeIcon, EyeOffIcon, MinusIcon, PlusIcon } from "@/components/icons";
import { useRouter } from "@/lib/useAppRouter";
import { normalizeSearchText } from "@/lib/search";
import { parseMultiFilter, serializeMultiFilter, singleIncluded, type MultiFilter } from "@/lib/multiFilter";

const DROPDOWN_WIDTH = 288;

type ComboOption = { id: string; label: string; dotColorClass?: string; dotColorHex?: string; single?: boolean };

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
  pinnedOptions = [],
  value,
  paramKey,
  basePath,
  currentParams,
  triggerColorClass,
  align = "left",
}: {
  allLabel: string;
  options: ComboOption[];
  /** Opciones fijas (ej. "Todos los proyectos") que van arriba, separadas de la lista buscable y siempre visibles. */
  pinnedOptions?: { id: string; label: string }[];
  value: string | undefined;
  paramKey: string;
  basePath: string;
  currentParams: Record<string, string | undefined>;
  /** Reemplaza la marea genérica del botón cuando hay un valor elegido — para sets con color propio (estado, alerta). */
  triggerColorClass?: string;
  /** "right" cuando el trigger queda pegado al borde derecho del viewport (si no, el dropdown se sale). */
  align?: "left" | "right";
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [fitsLeft, setFitsLeft] = useState(true);
  const [current, setCurrent] = useState(value);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelStyle = useFixedBelow(rootRef, open, align === "right" || !fitsLeft);

  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    setCurrent(value);
  }

  function toggle() {
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) setFitsLeft(rect.left + DROPDOWN_WIDTH <= window.innerWidth - 8);
    setOpen((o) => !o);
  }

  function buildHref(next: string | undefined) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(currentParams)) {
      if (v) p.set(k, v);
    }
    if (next) p.set(paramKey, next);
    else p.delete(paramKey);
    return `${basePath}?${p.toString()}`;
  }

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const allOptions: ComboOption[] = [...pinnedOptions, ...options];
  const labelOf = (id: string) => allOptions.find((o) => o.id === id);
  const fixedIds = new Set(allOptions.filter((o) => o.single || pinnedOptions.some((p) => p.id === o.id)).map((o) => o.id));
  const parsed = parseMultiFilter(current);
  const included = parsed.include.map(labelOf).filter((o): o is ComboOption => Boolean(o));
  const excluded = parsed.exclude.map(labelOf).filter((o): o is ComboOption => Boolean(o));
  const singleId = singleIncluded(current);
  const single = singleId ? labelOf(singleId) : undefined;
  const active = included.length > 0 || excluded.length > 0;
  const filtered = query
    ? options.filter((o) => normalizeSearchText(o.label).includes(normalizeSearchText(query)))
    : options;

  function apply(next: MultiFilter | string | undefined, close: boolean) {
    const serialized = typeof next === "object" ? serializeMultiFilter(next) : next;
    setCurrent(serialized);
    if (close) {
      setOpen(false);
      setQuery("");
    }
    // scroll: false — cambiar un filtro no debe subir la página ni resetear
    // el scroll del tablero al tope (comportamiento por defecto de Next.js
    // ante cualquier cambio de searchParams).
    router.push(buildHref(serialized), { scroll: false });
  }

  function toggleInclude(id: string) {
    const include = parsed.include.includes(id)
      ? parsed.include.filter((v) => v !== id)
      : [...parsed.include.filter((v) => !fixedIds.has(v)), id];
    apply({ include, exclude: parsed.exclude.filter((v) => v !== id) }, false);
  }

  function toggleHide(id: string) {
    const exclude = parsed.exclude.includes(id) ? parsed.exclude.filter((v) => v !== id) : [...parsed.exclude, id];
    apply({ include: parsed.include.filter((v) => v !== id), exclude }, false);
  }

  const actionClass =
    "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 max-sm:h-9 max-sm:w-9";

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={toggle}
        data-feature-hint="multi-select-filters"
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${active ? (single && triggerColorClass ? triggerColorClass : "bg-[#0a6b78] text-white") : "bg-slate-100 text-slate-600"}`}
      >
        {!triggerColorClass && (single?.dotColorClass || single?.dotColorHex) && (
          <span
            className={`h-2 w-2 flex-shrink-0 rounded-full ${single.dotColorClass ?? ""}`}
            style={single.dotColorHex ? { backgroundColor: single.dotColorHex } : undefined}
          />
        )}
        {included.length === 0 && excluded.length > 0 && <EyeOffIcon className="h-4 w-4 flex-shrink-0" />}
        {included.length > 0
          ? `${included[0].label}${included.length > 1 ? ` +${included.length - 1}` : ""}`
          : excluded.length > 0
          ? `Sin ${excluded[0].label}${excluded.length > 1 ? ` +${excluded.length - 1}` : ""}`
          : allLabel}
      </button>

      {open && panelStyle && createPortal(
        <div
          ref={panelRef}
          style={panelStyle}
          className="z-[70] w-72 max-w-[calc(100vw-1rem)] rounded-2xl bg-white p-2 shadow-[0_4px_8px_rgba(15,23,42,0.08),0_16px_40px_rgba(15,23,42,0.12)]"
        >
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
              onClick={() => apply(undefined, true)}
              className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-slate-50 ${!active ? "font-medium text-slate-900" : "text-slate-600"}`}
            >
              {allLabel}
            </button>
            {pinnedOptions.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => apply({ include: [o.id], exclude: parsed.exclude }, true)}
                className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-slate-50 ${parsed.include.includes(o.id) ? "font-medium text-slate-900" : "text-slate-600"}`}
              >
                {o.label}
              </button>
            ))}
            {pinnedOptions.length > 0 && <div className="my-1 border-t border-slate-100" />}
            {filtered.map((o) => {
              const isIncluded = parsed.include.includes(o.id);
              const isHidden = parsed.exclude.includes(o.id);
              return (
                <div
                  key={o.id}
                  className={`flex items-center gap-0.5 rounded-lg ${isIncluded ? "bg-[#0a6b78]/10" : "hover:bg-slate-50"}`}
                >
                  <button
                    type="button"
                    onClick={() => apply(o.single ? o.id : { include: [o.id], exclude: [] }, true)}
                    className={`flex min-w-0 flex-1 items-center gap-1.5 px-2.5 py-1.5 text-left text-sm ${isIncluded ? "font-medium text-slate-900" : isHidden ? "text-slate-400 line-through" : "text-slate-600"}`}
                  >
                    {(o.dotColorClass || o.dotColorHex) && (
                      <span
                        className={`h-2 w-2 flex-shrink-0 rounded-full ${isHidden ? "opacity-40" : ""} ${o.dotColorClass ?? ""}`}
                        style={o.dotColorHex ? { backgroundColor: o.dotColorHex } : undefined}
                      />
                    )}
                    <span className="truncate">{o.label}</span>
                    {isIncluded && <CheckIcon className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-[#0a6b78]" />}
                  </button>
                  {!o.single && (
                    <>
                      <button
                        type="button"
                        onClick={() => toggleInclude(o.id)}
                        title={isIncluded ? "Quitar" : "Agregar"}
                        aria-label={`${isIncluded ? "Quitar" : "Agregar"} ${o.label}`}
                        className={actionClass}
                      >
                        {isIncluded ? <MinusIcon className="h-3.5 w-3.5" /> : <PlusIcon className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleHide(o.id)}
                        title={isHidden ? "Mostrar" : "Ocultar"}
                        aria-label={`${isHidden ? "Mostrar" : "Ocultar"} ${o.label}`}
                        className={`${actionClass} ${isHidden ? "text-slate-700" : ""}`}
                      >
                        {isHidden ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                      </button>
                    </>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && <p className="px-2.5 py-1.5 text-xs text-slate-400">Sin resultados.</p>}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
