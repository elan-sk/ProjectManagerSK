import { prisma } from "@/lib/prisma";
import { calendarDay } from "@/lib/delays";

export type ActivityStats = {
  periodDays: number;
  activeDays: number;
  totalInteractions: number;
  /** Interacciones por día activo (minutos con uso real). */
  avgPerActiveDay: number;
  /** Interacciones por día del período completo, contando los días sin uso. */
  avgPerDay: number;
  /** Días desde el último uso; null si nunca hubo actividad en el período. */
  daysSinceLast: number | null;
};

/**
 * Frecuencia de uso real de la app por persona (últimos `periodDays` días):
 * cada "interacción" es un minuto en el que la persona hizo algo en la
 * pantalla (ver ActivityPing) — sirve para detectar inactividad sin depender
 * solo de cuándo inició sesión.
 */
export async function getUserActivityStats(userId: string, periodDays = 30): Promise<ActivityStats> {
  const today = calendarDay(new Date());
  const since = new Date(today);
  since.setUTCDate(since.getUTCDate() - (periodDays - 1));
  const rows = await prisma.userActivityDay.findMany({ where: { userId, day: { gte: since } }, orderBy: { day: "desc" } });
  const total = rows.reduce((sum, r) => sum + r.interactions, 0);
  return {
    periodDays,
    activeDays: rows.length,
    totalInteractions: total,
    avgPerActiveDay: rows.length > 0 ? Math.round((total / rows.length) * 10) / 10 : 0,
    avgPerDay: Math.round((total / periodDays) * 10) / 10,
    daysSinceLast: rows.length > 0 ? Math.round((today.getTime() - rows[0].day.getTime()) / 86400000) : null,
  };
}
