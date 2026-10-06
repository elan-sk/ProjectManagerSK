import { HEALTH_LABEL } from "@/lib/projectHealth";

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

/**
 * Estado único del proyecto (badge, filtro de salud y WhatsApp): con fecha de
 * cierre manda el cronograma — «Retrasado 1 semana», «A tiempo», «Holgura de
 * 2 meses» —; sin fecha de cierre, la salud de siempre (% de tareas vencidas).
 * `tone` es la misma escala que la salud (ok / warn / bad) para colores y filtro.
 */
export function projectStatus(health: keyof typeof HEALTH_LABEL, days: number | null): { label: string; tone: keyof typeof HEALTH_LABEL } {
  if (days === null) return { label: HEALTH_LABEL[health], tone: health };
  if (days < 0) return { label: `Retrasado ${amount(-days)}`, tone: "bad" };
  if (days > 0) return { label: `Holgura de ${amount(days)}`, tone: "ok" };
  return { label: "A tiempo", tone: "ok" };
}
