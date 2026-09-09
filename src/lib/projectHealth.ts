// Indicador de salud (punto confirmado con el usuario: % de tareas
// atrasadas) — "cómo voy" de un vistazo, sin tener que leer el detalle.
// Compartido entre la tarjeta de /projects y el resumen de /projects/[id].
export const HEALTH_LABEL = { ok: "Bien", warn: "Normal", bad: "Muy retrasado" } as const;
export const HEALTH_STYLE = {
  ok: "bg-emerald-50 text-emerald-700",
  warn: "bg-amber-50 text-amber-700",
  bad: "bg-red-50 text-red-700",
} as const;

export function projectHealth(overdueCount: number, total: number): keyof typeof HEALTH_LABEL {
  if (overdueCount === 0 || total === 0) return "ok";
  return overdueCount / total >= 0.2 ? "bad" : "warn";
}
