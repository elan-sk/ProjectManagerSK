// Texto del indicador de cronograma (spec 003). Sin prisma ni "use client":
// lo comparten las vistas de servidor, los componentes de cliente y WhatsApp.
// `days` en días hábiles: positivo = holgura, negativo = retraso, 0 = a tiempo.

const WEEK = 5;
const MONTH = 20;

function amount(n: number) {
  if (n < WEEK) return `${n} día${n === 1 ? "" : "s"}`;
  if (n < MONTH) {
    const weeks = Math.round(n / WEEK);
    return `${weeks} semana${weeks === 1 ? "" : "s"}`;
  }
  const months = Math.round((n / MONTH) * 2) / 2;
  return `${String(months).replace(".", ",")} ${months === 1 ? "mes" : "meses"}`;
}

export function scheduleVarianceText(days: number) {
  if (days === 0) return "A tiempo";
  return `${amount(Math.abs(days))} de ${days > 0 ? "holgura" : "retraso"}`;
}

export function scheduleVarianceExact(days: number) {
  const n = Math.abs(days);
  return days === 0 ? "Termina justo en la fecha de cierre" : `${n} día${n === 1 ? "" : "s"} hábil${n === 1 ? "" : "es"} de ${days > 0 ? "holgura" : "retraso"}`;
}

export type ScheduleFilter = "late" | "ahead" | "ontime";

export function matchesScheduleFilter(days: number | null, filter?: string) {
  if (!filter) return true;
  if (days === null) return false;
  return filter === "late" ? days < 0 : filter === "ahead" ? days > 0 : filter === "ontime" ? days === 0 : true;
}
