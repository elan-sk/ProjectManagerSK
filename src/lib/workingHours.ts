import { isBusinessDay, subtractBusinessDays } from "@/lib/holidays";

// ponytail: horario laboral fijo a Colombia (único uso real hoy, sin horario
// de verano así que el offset UTC-5 es constante todo el año). Si algún día
// hace falta soportar otro país, acá se resuelve el offset por countryCode.
const TIMEZONE = "America/Bogota";
const UTC_OFFSET_HOURS = 5;

// Convierte el valor crudo de un <input type="datetime-local"> ("YYYY-MM-
// DDTHH:mm", sin timezone) al instante UTC real, asumiendo que esa hora es
// hora de Bogotá — usado para Task.meetingAt (ver actions.ts de la tarea).
export function bogotaLocalToUTC(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour + UTC_OFFSET_HOURS, minute));
}

// Inverso de bogotaLocalToUTC — valor para el defaultValue de un <input
// type="datetime-local"> a partir de un instante UTC guardado en DB.
export function utcToBogotaLocalInputValue(date: Date) {
  const bogota = new Date(date.getTime() - UTC_OFFSET_HOURS * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${bogota.getUTCFullYear()}-${pad(bogota.getUTCMonth() + 1)}-${pad(bogota.getUTCDate())}T${pad(bogota.getUTCHours())}:${pad(bogota.getUTCMinutes())}`;
}

// Margen antes del cierre para que el recordatorio reprogramado (ver
// meetingReminderTargetTime) caiga claramente dentro del horario laboral y
// no justo en el borde donde isWorkingMoment ya lo considera cerrado.
const CLOSE_OF_DAY_MARGIN_MINUTES = 5;

function localParts(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Intl con hour12:false a veces devuelve "24" para la medianoche.
    hour: Number(parts.hour) % 24,
  };
}

// Día calendario en Bogotá, representado como medianoche UTC (mismo formato
// "date-only" que usa holidays.ts para comparar fechas y consultar festivos).
function localDateOnlyUTC(date: Date) {
  const { year, month, day } = localParts(date);
  return new Date(Date.UTC(year, month - 1, day));
}

function localHourToUTCDate(localDateUTCMidnight: Date, localHour: number, minuteOffset = 0) {
  return new Date(localDateUTCMidnight.getTime() + (localHour + UTC_OFFSET_HOURS) * 60 * 60 * 1000 + minuteOffset * 60 * 1000);
}

export async function isWorkingMoment(date: Date, countryCode: string, startHour: number, endHour: number) {
  const { hour } = localParts(date);
  if (hour < startHour || hour >= endHour) return false;
  return isBusinessDay(countryCode, localDateOnlyUTC(date));
}

// Si `meetingAt - 30min` cae en horario laboral, ese es el momento del
// recordatorio. Si no, se reprograma al cierre del horario laboral del día
// hábil anterior a la reunión (ej. reunión lunes 7am -> aviso viernes ~17:55).
export async function meetingReminderTargetTime(
  meetingAt: Date,
  countryCode: string,
  startHour: number,
  endHour: number
) {
  const normalTarget = new Date(meetingAt.getTime() - 30 * 60 * 1000);
  if (await isWorkingMoment(normalTarget, countryCode, startHour, endHour)) {
    return normalTarget;
  }
  const meetingLocalDay = localDateOnlyUTC(meetingAt);
  const previousBusinessDay = await subtractBusinessDays(countryCode, meetingLocalDay, 1);
  return localHourToUTCDate(previousBusinessDay, endHour, -CLOSE_OF_DAY_MARGIN_MINUTES);
}
