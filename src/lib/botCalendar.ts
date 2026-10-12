import { addBusinessDays, businessDaysBetween, getHolidays, isBusinessDay } from "@/lib/holidays";

const DAY_MS = 86400000;
export const WORKING_CALENDAR_MAX_DAYS = 800;

const parseDay = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);
const weekday = (date: Date) => date.toLocaleDateString("es-CO", { weekday: "long", timeZone: "UTC" });

export type WorkingCalendarInput = { from: string; to?: string; durationDays?: number };

export async function getWorkingCalendar(countryCode: string, input: WorkingCalendarInput) {
  const from = parseDay(input.from);
  const startIsBusinessDay = await isBusinessDay(countryCode, from);
  const firstBusinessDay = startIsBusinessDay ? from : await addBusinessDays(countryCode, from, 1);
  const endDate = input.durationDays ? await addBusinessDays(countryCode, firstBusinessDay, input.durationDays - 1) : null;
  const to = input.to ? parseDay(input.to) : endDate ?? new Date(Date.UTC(from.getUTCFullYear(), 11, 31));
  if (to < from) return { error: "La fecha final es anterior a la inicial." };
  const calendarDays = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
  if (calendarDays > WORKING_CALENDAR_MAX_DAYS) return { error: `El rango máximo es de ${WORKING_CALENDAR_MAX_DAYS} días.` };

  const years = Array.from({ length: to.getUTCFullYear() - from.getUTCFullYear() + 1 }, (_, i) => from.getUTCFullYear() + i);
  const holidays = (await Promise.all(years.map((year) => getHolidays(countryCode, year))))
    .flat()
    .filter((h) => h.date >= from && h.date <= to)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((h) => ({ date: toIso(h.date), weekday: weekday(h.date), name: h.name }));

  return {
    countryCode,
    from: input.from,
    fromWeekday: weekday(from),
    startIsBusinessDay,
    to: toIso(to),
    toWeekday: weekday(to),
    calendarDays,
    businessDays: await businessDaysBetween(countryCode, from, to),
    ...(endDate ? { durationDays: input.durationDays, endDate: toIso(endDate), endWeekday: weekday(endDate) } : {}),
    holidays,
  };
}
