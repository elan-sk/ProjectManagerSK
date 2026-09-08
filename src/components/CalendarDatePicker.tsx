"use client";

import { useEffect, useRef, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isSameDay,
  isSameMonth,
  isWeekend,
  startOfMonth,
  subMonths,
} from "date-fns";
import { es } from "date-fns/locale";

const WEEKDAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];

// ponytail: la previsualización del rango salta solo fines de semana (no
// festivos, esos requieren la API de Nager.Date con datos del servidor) —
// el cálculo final y real de plannedEnd sí es exacto, se resuelve en el
// servidor al crear la tarea. Esta grilla es solo una guía visual.
function previewRange(start: Date, businessDays: number) {
  if (businessDays <= 1) return [start];
  const days: Date[] = [start];
  const cursor = new Date(start);
  let remaining = businessDays - 1;
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() + 1);
    if (!isWeekend(cursor)) {
      days.push(new Date(cursor));
      remaining -= 1;
    }
  }
  return days;
}

export function CalendarDatePicker({
  name,
  label,
  defaultValue,
  previewDays = 1,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  previewDays?: number;
}) {
  const [value, setValue] = useState<Date | null>(defaultValue ? new Date(defaultValue + "T00:00:00") : null);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(value ?? new Date());
  const rootRef = useRef<HTMLDivElement>(null);

  // No cierra al elegir el día: así se ve resaltado el rango de días hábiles
  // resultante (punto 5 — estilo apps de hotel) antes de cerrar. Cierra solo
  // al hacer click afuera.
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const days = eachDayOfInterval({ start: startOfMonth(viewMonth), end: endOfMonth(viewMonth) });
  const leadingBlanks = (getDay(startOfMonth(viewMonth)) + 6) % 7; // lunes=0

  const rangeDays = value ? previewRange(value, previewDays) : [];

  return (
    <div className="relative" ref={rootRef}>
      <label className="text-sm text-slate-600">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-1 flex w-full items-center justify-between rounded-lg border border-slate-300 px-3 py-2 text-left text-sm hover:border-slate-400"
      >
        <span className={value ? "text-slate-900" : "text-slate-400"}>
          {value ? format(value, "d 'de' MMMM, yyyy", { locale: es }) : "Elegir fecha…"}
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 text-slate-400">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path strokeLinecap="round" d="M8 3v4M16 3v4M3 10h18" />
        </svg>
      </button>
      <input type="hidden" name={name} value={value ? format(value, "yyyy-MM-dd") : ""} required />

      {open && (
        <div className="absolute z-20 mt-1 w-72 rounded-2xl bg-white p-3 shadow-[0_4px_8px_rgba(15,23,42,0.08),0_16px_40px_rgba(15,23,42,0.12)]">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => setViewMonth((m) => subMonths(m, 1))} className="rounded p-1 text-slate-500 hover:bg-slate-100">
              ‹
            </button>
            <span className="text-sm font-medium capitalize text-slate-900">
              {format(viewMonth, "MMMM yyyy", { locale: es })}
            </span>
            <button type="button" onClick={() => setViewMonth((m) => addMonths(m, 1))} className="rounded p-1 text-slate-500 hover:bg-slate-100">
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-400">
            {WEEKDAY_LABELS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: leadingBlanks }).map((_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {days.map((day) => {
              const selected = value && isSameDay(day, value);
              const inPreview = rangeDays.some((d) => isSameDay(d, day));
              const weekend = isWeekend(day);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  disabled={weekend}
                  onClick={() => setValue(day)}
                  className={`h-8 rounded-lg text-xs ${
                    !isSameMonth(day, viewMonth) ? "text-slate-300" : weekend ? "text-slate-300" : "text-slate-700"
                  } ${selected ? "bg-slate-900 text-white" : inPreview ? "bg-emerald-100 text-emerald-800" : "hover:bg-slate-100"} ${
                    weekend ? "cursor-not-allowed" : ""
                  }`}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>
          {value && previewDays > 1 && (
            <p className="mt-2 text-[11px] text-slate-400">
              Vista previa de {previewDays} días hábiles (festivos no incluidos en la vista previa, sí en el cálculo real).
            </p>
          )}
          {value && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-2 w-full rounded-lg bg-slate-900 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              Listo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
