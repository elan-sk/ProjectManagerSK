import { ProjectAlertLink } from "@/app/(app)/ProjectAlertLink";
import { ReferencePopover } from "@/components/ReferencePopover";
import { HEALTH_LABEL, HEALTH_STYLE } from "@/lib/projectHealth";
import type { getBottlenecks } from "@/lib/delays";

// Mismo resumen que la tarjeta de /projects (salud, progreso, cuellos de
// botella) — separado en dos piezas para poder acomodarlas en distintos
// layouts (la card las mezcla con el badge de fase y el avatar del PM en una
// misma fila; /projects/[id] las apila aparte) sin duplicar el JSX.

// Punto confirmado con el usuario: compara targetEndDate (cierre
// comprometido del proyecto) contra cuándo terminaría de verdad el
// proyecto completo — la fecha de cierre más tardía entre todas sus
// tareas, real para las ya completadas y planeada (ya corrida en cascada
// por sus predecesoras reales) para el resto — ver
// getProjectCompletionVariance en delays.ts. Distinto de openSlackDays de
// al lado (margen estructural CPM de las tareas todavía abiertas).
// Positivo = terminaría antes del deadline (holgura), negativo = después
// (retraso), null = sin targetEndDate o sin tareas en ese alcance.
export function ScheduleVarianceBadge({ days }: { days: number | null }) {
  if (days === null || days === 0) return null;
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
        days > 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
      }`}
    >
      {days > 0 ? `+${days}d holgura` : `${Math.abs(days)}d retraso`}
    </span>
  );
}

export function ProjectHealthBadges({
  projectId,
  health,
  overdueCount,
  overdueTasks,
  warningCount,
  warningTasks,
  lateStartCount = 0,
  lateStartTasks = [],
  openSlackDays = null,
  scheduleVarianceDays = null,
}: {
  projectId: string;
  health: keyof typeof HEALTH_LABEL;
  overdueCount: number;
  overdueTasks: { id: string; title: string }[];
  warningCount: number;
  warningTasks: { id: string; title: string }[];
  lateStartCount?: number;
  lateStartTasks?: { id: string; title: string }[];
  openSlackDays?: number | null;
  scheduleVarianceDays?: number | null;
}) {
  return (
    <>
      {/* Salud general (% de tareas con final retrasado sobre el total) —
          badge propio, independiente de los conteos de abajo: da el "cómo
          voy" de un vistazo sin tener que abrir Rendimiento ni sumar los
          conteos de alertas a mano. */}
      <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${HEALTH_STYLE[health]}`}>
        {HEALTH_LABEL[health]}
        {health === "ok" && openSlackDays !== null && openSlackDays !== 0 && ` · ${openSlackDays}d de holgura`}
      </span>
      {lateStartCount > 0 && (
        <ProjectAlertLink
          projectId={projectId}
          risk="lateStart"
          items={lateStartTasks.map((t) => ({ id: t.id, label: t.title, href: `/projects/${projectId}/tasks/${t.id}` }))}
          className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 hover:brightness-95"
        >
          {lateStartCount} · Inicio retrasado
        </ProjectAlertLink>
      )}
      {warningCount > 0 && (
        <ProjectAlertLink
          projectId={projectId}
          risk="warning"
          items={warningTasks.map((t) => ({ id: t.id, label: t.title, href: `/projects/${projectId}/tasks/${t.id}` }))}
          className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 hover:brightness-95"
        >
          {warningCount} por vencer
        </ProjectAlertLink>
      )}
      {overdueCount > 0 && (
        <ProjectAlertLink
          projectId={projectId}
          risk="overdue"
          items={overdueTasks.map((t) => ({ id: t.id, label: t.title, href: `/projects/${projectId}/tasks/${t.id}` }))}
          className="rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700 hover:brightness-95"
        >
          {overdueCount} final retrasado
        </ProjectAlertLink>
      )}
      <ScheduleVarianceBadge days={scheduleVarianceDays} />
    </>
  );
}

export function ProjectProgress({
  projectId,
  bottlenecks,
  total,
  completed,
}: {
  projectId: string;
  bottlenecks: Awaited<ReturnType<typeof getBottlenecks>>;
  total: number;
  completed: number;
}) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/10">
          <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="flex-shrink-0 text-xs text-slate-500">
          {pct}% · {completed}/{total} tareas
        </span>
      </div>

      {bottlenecks.length > 0 && (
        <p className="mt-1 text-xs text-amber-600">
          <ReferencePopover
            trigger={
              // Truncado en JS (no con la clase "truncate"/overflow-hidden de
              // CSS): ese overflow, puesto en un ancestro, recortaba también
              // el popover absoluto que debía aparecer flotando debajo —
              // el click abría el popup, pero quedaba invisible (bug real
              // reportado por el usuario).
              (() => {
                const summary = `${bottlenecks.length} cuello(s) de botella: ${bottlenecks
                  .slice(0, 2)
                  .map((b) => b.title)
                  .join(", ")}${bottlenecks.length > 2 ? ` +${bottlenecks.length - 2} más` : ""}`;
                return summary.length > 80 ? `${summary.slice(0, 79)}…` : summary;
              })()
            }
            hoverText={bottlenecks.map((b) => `${b.title}: ${b.bottleneckReason}`).join("\n")}
            items={bottlenecks.map((b) => ({ id: b.id, label: b.title, href: `/projects/${projectId}/tasks/${b.id}` }))}
          />
        </p>
      )}
    </div>
  );
}
