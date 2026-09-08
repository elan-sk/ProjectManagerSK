// Utilidades compartidas por el calendario de cada proyecto y el panorama
// general multi-proyecto (/projects) — todo en componentes UTC (nunca Date
// local), mismo motivo que el fix de holidays.ts: evita que el día
// calendario se corra según la zona horaria del servidor o del navegador.
export function utcDate(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m, d));
}
export function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}
export function mondayOnOrBefore(d: Date) {
  const diff = (d.getUTCDay() + 6) % 7;
  const res = new Date(d);
  res.setUTCDate(res.getUTCDate() - diff);
  return res;
}
export function sundayOnOrAfter(d: Date) {
  const diff = (7 - d.getUTCDay()) % 7;
  const res = new Date(d);
  res.setUTCDate(res.getUTCDate() + diff);
  return res;
}
export function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function dayKey(d: Date) {
  return isoDay(d);
}
export function addDays(d: Date, n: number) {
  const res = new Date(d);
  res.setUTCDate(res.getUTCDate() + n);
  return res;
}

export type CalendarMode = "month" | "week" | "day";

/** Rango de días a mostrar según el modo, ancorado a `anchor` (una fecha cualquiera dentro del período deseado). */
export function rangeForMode(mode: CalendarMode, anchor: Date) {
  if (mode === "day") {
    return { start: anchor, end: anchor };
  }
  if (mode === "week") {
    const start = mondayOnOrBefore(anchor);
    return { start, end: addDays(start, 6) };
  }
  const monthStart = utcDate(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1);
  const monthEnd = utcDate(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0);
  return { start: mondayOnOrBefore(monthStart), end: sundayOnOrAfter(monthEnd) };
}

/** Ancla siguiente/anterior según el modo (mes: mismo día del mes siguiente; semana: +/-7 días; día: +/-1 día). */
export function stepAnchor(mode: CalendarMode, anchor: Date, direction: 1 | -1) {
  if (mode === "day") return addDays(anchor, direction);
  if (mode === "week") return addDays(anchor, direction * 7);
  return utcDate(anchor.getUTCFullYear(), anchor.getUTCMonth() + direction, 1);
}
