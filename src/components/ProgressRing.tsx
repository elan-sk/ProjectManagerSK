import { useId } from "react";

// Mini anillo de avance — mismo par de colores que la barra lineal ya
// establecida en el proyecto (bg-emerald-500 sobre bg-slate-100/200), solo
// que en forma de anillo para aprovechar espacios angostos en tarjetas.
// `overdue`: reemplaza el emerald por el rojo de alerta ya usado en el resto
// de la app (badges "N atrasada(s)") cuando el ítem tiene tareas vencidas.
// El trazo lleva degradado (mismos tonos que .progress-fill-emerald/-red en
// globals.css) — useId() evita que dos anillos en la misma página compartan
// el id del gradiente y se pisen entre sí.
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
  const gradientId = `progress-ring-${useId()}`;
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
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          {overdue ? (
            <>
              <stop offset="0%" stopColor="#752520" />
              <stop offset="30%" stopColor="#b83b35" />
              <stop offset="65%" stopColor="#e8887c" />
              <stop offset="100%" stopColor="#ffc6bc" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#0e4230" />
              <stop offset="30%" stopColor="#176b4c" />
              <stop offset="65%" stopColor="#4fa87d" />
              <stop offset="100%" stopColor="#8ee6ac" />
            </>
          )}
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
    </svg>
  );
}
