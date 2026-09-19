"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { addMonths, eachDayOfInterval, endOfMonth, format, getDay, isAfter, isBefore, isSameDay, parseISO, startOfMonth, subMonths } from "date-fns";
import { es } from "date-fns/locale";

const WEEKDAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];
const POPOVER_W = 600;

const dayKey = (d: Date) => format(d, "yyyy-MM-dd");

function Month({
  month,
  from,
  to,
  hover,
  onPick,
  onHover,
}: {
  month: Date;
  from: Date | null;
  to: Date | null;
  hover: Date | null;
  onPick: (d: Date) => void;
  onHover: (d: Date | null) => void;
}) {
  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
  const blanks = (getDay(startOfMonth(month)) + 6) % 7; // lunes = 0
  // Mientras se elige el fin, el rango se previsualiza hasta el día bajo el cursor.
  const rangeEnd = to ?? (from && hover && !isBefore(hover, from) ? hover : null);
  return (
    <div className="w-64">
      <p className="mb-2 text-center text-sm font-medium capitalize text-slate-900">{format(month, "MMMM yyyy", { locale: es })}</p>
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-slate-400">
        {WEEKDAY_LABELS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7">
        {Array.from({ length: blanks }).map((_, i) => (
          <span key={i} />
        ))}
        {days.map((day) => {
          const isStart = from && isSameDay(day, from);
          const isEnd = rangeEnd && isSameDay(day, rangeEnd);
          const inRange = from && rangeEnd && isAfter(day, from) && isBefore(day, rangeEnd);
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onPick(day)}
              onMouseEnter={() => onHover(day)}
              onMouseLeave={() => onHover(null)}
              className={`h-8 text-xs ${
                isStart || isEnd
                  ? "bg-[#0a6b78] font-semibold text-white"
                  : inRange
                  ? "bg-[#0a6b78]/10 text-[#0a6b78]"
                  : "text-slate-700 hover:bg-slate-100"
              } ${isStart && rangeEnd && !isSameDay(from!, rangeEnd) ? "rounded-l-lg" : isStart ? "rounded-lg" : ""} ${
                isEnd && from && !isSameDay(from, rangeEnd!) ? "rounded-r-lg" : isEnd ? "rounded-lg" : ""
              } ${!isStart && !isEnd && !inRange ? "rounded-lg" : ""}`}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Filtro de rango de fechas (estilo reserva de hotel): dos meses lado a lado,
 * primer click = inicio, segundo click = fin (aplica de inmediato). Deja los
 * params `from`/`to` en la URL igual que ComboFilter, así que funciona en
 * cualquier vista con `basePath` + `currentParams` (datos planos).
 */
export function DateRangeFilter({
  from,
  to,
  basePath,
  currentParams,
  label = "Todas las fechas",
}: {
  from: string | undefined;
  to: string | undefined;
  basePath: string;
  currentParams: Record<string, string | undefined>;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState<Date | null>(null);
  const [draftTo, setDraftTo] = useState<Date | null>(null);
  const [hover, setHover] = useState<Date | null>(null);
  const [viewMonth, setViewMonth] = useState(() => (from ? parseISO(from) : new Date()));
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const active = Boolean(from || to);
  const fmt = (k: string) => format(parseISO(k), "d MMM", { locale: es });
  const triggerLabel = from && to ? `${fmt(from)} – ${fmt(to)}` : from ? `Desde ${fmt(from)}` : to ? `Hasta ${fmt(to)}` : label;

  function place() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(POPOVER_W, window.innerWidth - 16);
    setPos({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) });
  }

  useEffect(() => {
    if (!open) return;
    place();
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  function href(nextFrom: string | undefined, nextTo: string | undefined) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(currentParams)) if (v) p.set(k, v);
    if (nextFrom) p.set("from", nextFrom);
    if (nextTo) p.set("to", nextTo);
    const qs = p.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  }

  function toggle() {
    if (!open) {
      setDraftFrom(from ? parseISO(from) : null);
      setDraftTo(to ? parseISO(to) : null);
    }
    setOpen((o) => !o);
  }

  function pick(day: Date) {
    // Sin inicio, o ya había un rango completo: empieza uno nuevo.
    if (!draftFrom || draftTo) {
      setDraftFrom(day);
      setDraftTo(null);
      return;
    }
    const [a, b] = isBefore(day, draftFrom) ? [day, draftFrom] : [draftFrom, day];
    setDraftFrom(a);
    setDraftTo(b);
    setOpen(false);
    router.push(href(dayKey(a), dayKey(b)), { scroll: false });
  }

  function clear() {
    setOpen(false);
    router.push(href(undefined, undefined), { scroll: false });
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${active ? "bg-[#0a6b78] text-white" : "bg-slate-100 text-slate-600"}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-3.5 w-3.5">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path strokeLinecap="round" d="M8 3v4M16 3v4M3 10h18" />
        </svg>
        {triggerLabel}
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popoverRef}
            className="fixed z-100 max-w-[calc(100vw-1rem)] rounded-2xl bg-white p-4 shadow-[0_4px_8px_rgba(15,23,42,0.08),0_16px_40px_rgba(15,23,42,0.12)]"
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="mb-2 flex items-center justify-between">
              <button type="button" onClick={() => setViewMonth((m) => subMonths(m, 1))} aria-label="Mes anterior" className="rounded p-1 text-slate-500 hover:bg-slate-100">
                ‹
              </button>
              <span className="text-xs text-slate-400">{draftFrom && !draftTo ? "Elegí el día final" : "Elegí el día inicial y el final"}</span>
              <button type="button" onClick={() => setViewMonth((m) => addMonths(m, 1))} aria-label="Mes siguiente" className="rounded p-1 text-slate-500 hover:bg-slate-100">
                ›
              </button>
            </div>
            <div className="flex gap-6 overflow-x-auto">
              <Month month={viewMonth} from={draftFrom} to={draftTo} hover={hover} onPick={pick} onHover={setHover} />
              <div className="hidden sm:block">
                <Month month={addMonths(viewMonth, 1)} from={draftFrom} to={draftTo} hover={hover} onPick={pick} onHover={setHover} />
              </div>
            </div>
            {active && (
              <button type="button" onClick={clear} className="mt-3 text-xs font-medium text-slate-500 hover:text-slate-900 hover:underline">
                Quitar fechas
              </button>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
