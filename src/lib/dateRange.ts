// Filtro de rango de fechas compartido por todas las vistas de tareas
// (Tablero, Gantt, Calendario, Agenda, Panorama). Params `from`/`to` en
// YYYY-MM-DD. Una tarea entra si su plazo (plannedStart–plannedEnd) SE CRUZA
// con el rango — no solo si empieza o termina dentro de él.
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function parseDayKey(value: string | undefined): string | undefined {
  return value && DAY_KEY.test(value) ? value : undefined;
}

export function matchesDateRange(
  task: { plannedStart: Date; plannedEnd: Date },
  from: string | undefined,
  to: string | undefined
): boolean {
  const start = task.plannedStart.toISOString().slice(0, 10);
  const end = task.plannedEnd.toISOString().slice(0, 10);
  if (from && end < from) return false;
  if (to && start > to) return false;
  return true;
}
