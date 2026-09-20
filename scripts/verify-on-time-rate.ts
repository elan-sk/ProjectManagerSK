import assert from "node:assert/strict";
import { isDeliveredOnTime, getTaskScheduleVariance, calendarDay } from "../src/lib/delays";

// Cumplimiento a tiempo (fase 2, punto 5): fecha real de cierre vs plannedEnd.
// Lógica pura + festivos en caché — no escribe nada en la DB.
async function main() {
  const plannedEnd = new Date("2026-09-09"); // miércoles
  const at = (iso: string) => new Date(iso); // instantes UTC reales

  // Cerrada el mismo día planeado a media tarde (Bogotá) -> a tiempo, 0 días.
  const sameDay = { plannedEnd, actualEnd: at("2026-09-09T19:30:00Z") };
  assert.equal(isDeliveredOnTime(sameDay), true);
  assert.equal(await getTaskScheduleVariance("CO", sameDay), 0);

  // 22:00 en Bogotá ya es el día siguiente en UTC: sigue siendo el mismo día local.
  const lateNight = { plannedEnd, actualEnd: at("2026-09-10T02:00:00Z") };
  assert.equal(calendarDay(lateNight.actualEnd).toISOString().slice(0, 10), "2026-09-09");
  assert.equal(isDeliveredOnTime(lateNight), true);

  // Un día antes -> a tiempo.
  assert.equal(isDeliveredOnTime({ plannedEnd, actualEnd: at("2026-09-08T15:00:00Z") }), true);

  // Un día después -> a destiempo, aunque la tarea haya durado lo planeado.
  const late = { plannedEnd, actualEnd: at("2026-09-10T15:00:00Z") };
  assert.equal(isDeliveredOnTime(late), false);
  assert.ok(((await getTaskScheduleVariance("CO", late)) ?? 0) < 0);

  // Sin fecha real de cierre -> no cuenta como entregada a tiempo.
  assert.equal(isDeliveredOnTime({ plannedEnd, actualEnd: null }), false);

  // El % baja al haber entregas fuera de plazo: 3 de 4 a tiempo = 75%, no 100%.
  const tasks = [sameDay, lateNight, { plannedEnd, actualEnd: at("2026-09-08T15:00:00Z") }, late];
  const rate = tasks.filter(isDeliveredOnTime).length / tasks.length;
  assert.equal(rate, 0.75);
  console.log("verify-on-time-rate: OK");
  process.exit(0); // el cliente de Prisma deja handles abiertos
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
