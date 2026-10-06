import assert from "node:assert/strict";
import { buildProjectForecast, type ForecastTask, type ForecastEdge } from "../src/lib/scheduleForecast";
import { scheduleVarianceText } from "../src/lib/scheduleVarianceLabel";

// Pronóstico de cronograma (spec 003). Fechas de septiembre de 2026 (sin
// festivos en CO). "Hoy" fijo: miércoles 16.
const d = (s: string) => new Date(`2026-09-${s}T00:00:00Z`);
const TODAY = d("16");
let n = 0;
const task = (status: ForecastTask["status"], start: string, end: string, actualEnd?: string): ForecastTask => ({
  id: `t${++n}`,
  title: `T${n}`,
  status,
  plannedStart: d(start),
  plannedEnd: d(end),
  actualEnd: actualEnd ? d(actualEnd) : null,
});
const fs = (a: ForecastTask, b: ForecastTask): ForecastEdge => ({ predecessorId: a.id, successorId: b.id, type: "FINISH_TO_START" });
const run = (target: string | null, tasks: ForecastTask[], edges: ForecastEdge[] = []) =>
  buildProjectForecast("CO", target ? d(target) : null, tasks, edges, TODAY);

async function main() {
  // 1. Tarea crítica en curso y vencida (7–9, 3 días): termina hoy + 3 = lun 21;
  //    su sucesora sin iniciar (10–11, 2 días) pasa a 22–23. Cierre vie 11 → 8 días de retraso.
  {
    const a = task("IN_PROGRESS", "07", "09");
    const b = task("NOT_STARTED", "10", "11");
    const f = await run("11", [a, b], [fs(a, b)]);
    assert.equal(f.tasks.get(a.id)!.end.toISOString().slice(0, 10), "2026-09-21");
    assert.equal(f.tasks.get(b.id)!.start.toISOString().slice(0, 10), "2026-09-22");
    assert.equal(f.projectedEnd!.toISOString().slice(0, 10), "2026-09-23");
    assert.equal(f.varianceDays, -8);
    assert.deepEqual(f.drivers.map((t) => t.id), [a.id], "la tarea vencida es la que empuja");
  }

  // 2. Tarea sin iniciar atrasada pero fuera de la ruta: se absorbe (el fin lo define otra).
  {
    const x = task("NOT_STARTED", "14", "14");
    const c = task("IN_PROGRESS", "16", "30");
    const f = await run("30", [x, c]);
    assert.equal(f.varianceDays, 0);
    assert.equal(scheduleVarianceText(f.varianceDays!), "A tiempo");
  }

  // 3. Todo al día y el plan termina antes del cierre → holgura.
  {
    const f = await run("30", [task("IN_PROGRESS", "14", "25")]);
    assert.equal(f.varianceDays, 3);
  }

  // 4. Sin iniciar con el inicio ya pasado (14–15, 2 días): arranca hoy, termina jue 17.
  {
    const f = await run("15", [task("NOT_STARTED", "14", "15")]);
    assert.equal(f.projectedEnd!.toISOString().slice(0, 10), "2026-09-17");
    assert.equal(f.varianceDays, -2);
  }

  // 5. Completada tarde: ya se corrió el plan de su sucesora; cuenta su fin real.
  {
    const g = task("COMPLETED", "10", "11", "15");
    const h = task("NOT_STARTED", "16", "18");
    const f = await run("18", [g, h], [fs(g, h)]);
    assert.equal(f.varianceDays, 0);
    assert.equal(f.drivers.length, 0);
  }

  // 6. Sin fecha de cierre: no hay indicador.
  assert.equal((await run(null, [task("IN_PROGRESS", "07", "09")])).varianceDays, null);

  // 7. Redondeo días → semanas → meses.
  assert.equal(scheduleVarianceText(-1), "1 día de retraso");
  assert.equal(scheduleVarianceText(-4), "4 días de retraso");
  assert.equal(scheduleVarianceText(5), "1 semana de holgura");
  assert.equal(scheduleVarianceText(-19), "4 semanas de retraso");
  assert.equal(scheduleVarianceText(-20), "1 mes de retraso");
  assert.equal(scheduleVarianceText(30), "1,5 meses de holgura");

  console.log("verify-schedule-forecast: OK");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
