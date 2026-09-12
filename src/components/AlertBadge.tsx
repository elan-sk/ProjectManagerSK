import type { TaskAlert } from "@/lib/delays";

// Punto 4: mismo esquema de color en todo el sistema (cards, lista de
// proyectos, agenda) para que un atraso se reconozca de un vistazo sin leer
// texto. onTrack/done no pintan nada — el ruido visual debe reservarse para
// lo que necesita atención. Un tono más saturado que taskCardTint() — la
// card ya tiene el fondo teñido (ej. bg-red-50), así que el badge necesita
// más contraste (bg-red-100) para no perderse contra su propio fondo.
// Exportado (no solo local) para que el chat de Chontatec pinte el mismo
// color de alerta sin duplicar la paleta — ver ChontatecWidget.tsx.
export const ALERT_STYLE: Partial<Record<TaskAlert["level"], string>> = {
  overdue: "bg-red-100 text-red-800",
  warning: "bg-amber-100 text-amber-800",
  blocked: "bg-rose-100 text-rose-800",
  // Más suave que "warning" (amber-50 en vez de amber-100): todavía no es
  // grave, solo un aviso de que ya debería estar en curso.
  lateStart: "bg-blue-50 text-blue-700",
};
const STYLE = ALERT_STYLE;

// Etiqueta corta y genérica (sin cantidad de días) para el chat, que no
// siempre tiene el TaskAlert completo a mano — el badge de la UI normal
// sigue usando LABEL (más abajo), con el conteo de días exacto.
export const ALERT_LEVEL_LABEL: Partial<Record<TaskAlert["level"], string>> = {
  overdue: "Vencida",
  warning: "Por vencer",
  blocked: "Bloqueada",
  lateStart: "Inicio retrasado",
};

function dayWord(n: number) {
  return `${n} día${n !== 1 ? "s" : ""}`;
}

const LABEL: Partial<Record<TaskAlert["level"], (alert: TaskAlert) => string>> = {
  overdue: (a) => `Hace ${dayWord(a.businessDaysOverdue)}`,
  warning: (a) => `En ${dayWord(a.daysRemaining)}`,
  blocked: () => "Bloqueada",
  lateStart: (a) => `Inicio retrasado, hace ${dayWord(a.businessDaysOverdue)}`,
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
