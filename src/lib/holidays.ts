import { prisma } from "@/lib/prisma";
import type { Holiday } from "@prisma/client";

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

// Caché en memoria del proceso: los festivos de un país/año no cambian
// durante la vida del servidor, así que evita repetir la consulta a SQLite
// en cada día verificado. Sin esto, calcular el atraso/rango de un proyecto
// con ~30 tareas dispara cientos de queries síncronas por carga de página
// (un isBusinessDay por día del rango, cada uno con su propio findMany) —
// hallado al ver /projects tardando 5-9s de "application-code" real.
const holidayCache = new Map<string, Holiday[]>();

// Devuelve los festivos de un país/año, sirviendo desde caché (memoria, y
// detrás de esa, la tabla) si ya se sincronizaron antes. El usuario nunca
// los carga a mano.
export async function getHolidays(countryCode: string, year: number) {
  const cacheKey = `${countryCode}:${year}`;
  const inMemory = holidayCache.get(cacheKey);
  if (inMemory) return inMemory;

  const cached = await prisma.holiday.findMany({
    where: { countryCode, year },
  });
  if (cached.length > 0) {
    holidayCache.set(cacheKey, cached);
    return cached;
  }

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
  const result = await prisma.holiday.findMany({ where: { countryCode, year } });
  holidayCache.set(cacheKey, result);
  return result;
}

// Todo el cálculo opera en componentes UTC (getUTCDay/setUTCDate), nunca en
// hora local: las fechas "YYYY-MM-DD" que llegan de la API, de <input
// type=date> o de Zod (z.coerce.date()) se parsean como medianoche UTC. Si
// se leyeran con getDay()/setDate() (hora local) y el servidor corre en una
// zona con offset negativo (ej. America/Bogota, UTC-5), esa medianoche UTC
// cae en la noche del día calendario ANTERIOR en hora local, corriendo todo
// el conteo de días hábiles un día para atrás. Trabajar siempre en UTC evita
// el corrimiento sin importar en qué zona horaria corra el servidor.
function isWeekend(date: Date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export async function isBusinessDay(countryCode: string, date: Date) {
  if (isWeekend(date)) return false;
  const holidays = await getHolidays(countryCode, date.getUTCFullYear());
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
    result.setUTCDate(result.getUTCDate() + 1);
    if (await isBusinessDay(countryCode, result)) remaining -= 1;
  }
  return result;
}

// Espejo de addBusinessDays: resta `days` días hábiles a partir de `start`
// (sin contar `start` mismo). Usada por el backward pass de criticalPath.ts.
export async function subtractBusinessDays(
  countryCode: string,
  start: Date,
  days: number
) {
  const result = new Date(start);
  let remaining = days;
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() - 1);
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
    cursor.setUTCDate(cursor.getUTCDate() + 1);
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
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

// Punto de hoy en términos de fecha calendario UTC (consistente con cómo se
// generan y comparan todas las demás fechas de este módulo).
export function todayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
