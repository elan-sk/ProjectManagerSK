import { prisma } from "@/lib/prisma";

// ponytail: Nager.Date es gratis, sin auth y ya cubre 100+ países (incl. CO,
// verificado contra el Excel de referencia). Si algún día se vuelve poco
// confiable, la alternativa es auto-hospedar la misma librería vía Docker.
const NAGER_DATE_BASE_URL = "https://date.nager.at/api/v3/publicholidays";

async function fetchHolidaysFromApi(countryCode: string, year: number) {
  const res = await fetch(`${NAGER_DATE_BASE_URL}/${year}/${countryCode}`);
  if (!res.ok) {
    throw new Error(
      `No se pudieron obtener los festivos de ${countryCode} ${year}: ${res.status}`
    );
  }
  const data = (await res.json()) as Array<{ date: string; localName: string }>;
  return data.map((h) => ({ date: h.date, name: h.localName }));
}

// Devuelve los festivos de un país/año, sirviendo desde caché local si ya
// se sincronizaron antes. El usuario nunca los carga a mano.
export async function getHolidays(countryCode: string, year: number) {
  const cached = await prisma.holiday.findMany({
    where: { countryCode, year },
  });
  if (cached.length > 0) return cached;

  const fetched = await fetchHolidaysFromApi(countryCode, year);
  try {
    // SQLite no soporta skipDuplicates en createMany. Puede chocar contra la
    // restricción única si otra tarea en paralelo (ver getProjectDelaySummary,
    // que calcula varias tareas a la vez) ya sincronizó este país/año primero
    // — en ese caso ya está en caché, no es un error real.
    await prisma.holiday.createMany({
      data: fetched.map((h) => ({
        countryCode,
        year,
        date: new Date(h.date),
        name: h.name,
      })),
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "P2002") throw err;
  }
  return prisma.holiday.findMany({ where: { countryCode, year } });
}

function isWeekend(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export async function isBusinessDay(countryCode: string, date: Date) {
  if (isWeekend(date)) return false;
  const holidays = await getHolidays(countryCode, date.getFullYear());
  const dateStr = date.toISOString().slice(0, 10);
  return !holidays.some((h) => h.date.toISOString().slice(0, 10) === dateStr);
}

// Suma `days` días hábiles a partir de `start` (sin contar `start` mismo),
// saltando fines de semana y festivos — misma lógica que las fórmulas del
// Cronograma_Racafe.xlsx, pero resuelta en código.
export async function addBusinessDays(
  countryCode: string,
  start: Date,
  days: number
) {
  const result = new Date(start);
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (await isBusinessDay(countryCode, result)) remaining -= 1;
  }
  return result;
}

// Lista las fechas hábiles entre dos fechas (inclusive) — usada para
// posicionar las barras del Gantt sin contar fines de semana ni festivos,
// igual que el Cronograma_Racafe.xlsx de referencia.
export async function businessDaysRange(countryCode: string, start: Date, end: Date) {
  const days: Date[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    if (await isBusinessDay(countryCode, cursor)) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

// Cuenta los días hábiles entre dos fechas (inclusive), usado para medir
// duración planeada/real de una tarea.
export async function businessDaysBetween(
  countryCode: string,
  start: Date,
  end: Date
) {
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    if (await isBusinessDay(countryCode, cursor)) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}
