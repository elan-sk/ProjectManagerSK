/**
 * Línea vertical de "hoy" en el Gantt — puramente decorativa: solo se ve, sin
 * click ni hover (pointer-events-none), para que nunca le estorbe la
 * interacción a las barras que pasen por debajo. `prefix`/`colorClass`
 * opcionales reusan el mismo componente para otras líneas de fecha (ej. el
 * deadline del proyecto).
 */
export function TodayMarker({
  left,
  height,
  colorClass = "bg-amber-400",
}: {
  left: number;
  height: number;
  colorClass?: string;
}) {
  return <div className={`pointer-events-none absolute top-0 z-[25] w-px ${colorClass}`} style={{ left, height }} />;
}
