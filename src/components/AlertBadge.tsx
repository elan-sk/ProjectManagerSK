import type { TaskAlert } from "@/lib/delays";

// Punto 4: mismo esquema de color en todo el sistema (cards, lista de
// proyectos, agenda) para que un atraso se reconozca de un vistazo sin leer
// texto. onTrack/done no pintan nada — el ruido visual debe reservarse para
// lo que necesita atención. Un tono más saturado que taskCardTint() — la
// card ya tiene el fondo teñido (ej. bg-red-50), así que el badge necesita
// más contraste (bg-red-100) para no perderse contra su propio fondo.
const STYLE: Partial<Record<TaskAlert["level"], string>> = {
  overdue: "bg-red-100 text-red-800",
  warning: "bg-amber-100 text-amber-800",
  blocked: "bg-rose-100 text-rose-800",
};

function dayWord(n: number) {
  return `${n} día${n !== 1 ? "s" : ""}`;
}

const LABEL: Partial<Record<TaskAlert["level"], (alert: TaskAlert) => string>> = {
  overdue: (a) => `Hace ${dayWord(a.businessDaysOverdue)}`,
  warning: (a) => `En ${dayWord(a.daysRemaining)}`,
  blocked: () => "Bloqueada",
};

export function AlertBadge({ alert, className = "" }: { alert: TaskAlert; className?: string }) {
  const style = STYLE[alert.level];
  const label = LABEL[alert.level];
  if (!style || !label) return null;

  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ${style} ${className}`}>
      {label(alert)}
    </span>
  );
}
