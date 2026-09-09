// Mini anillo de avance — mismo par de colores que la barra lineal ya
// establecida en el proyecto (bg-emerald-500 sobre bg-slate-100/200), solo
// que en forma de anillo para aprovechar espacios angostos en tarjetas.
// `overdue`: reemplaza el emerald por el rojo de alerta ya usado en el resto
// de la app (badges "N atrasada(s)") cuando el ítem tiene tareas vencidas.
export function ProgressRing({
  pct,
  overdue = false,
  size = 34,
  strokeWidth = 4,
}: {
  pct: number;
  overdue?: boolean;
  size?: number;
  strokeWidth?: number;
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="-rotate-90 shrink-0"
      role="img"
      aria-label={`${clamped}% completado${overdue ? ", con tareas atrasadas" : ""}`}
    >
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={overdue ? "#ef4444" : "#10b981"}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
    </svg>
  );
}
