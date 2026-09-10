import { ProjectAlertLink } from "@/app/(app)/ProjectAlertLink";
import { ReferencePopover } from "@/components/ReferencePopover";
import { HEALTH_LABEL, HEALTH_STYLE } from "@/lib/projectHealth";
import type { getBottlenecks } from "@/lib/delays";

// Mismo resumen que la tarjeta de /projects (salud, progreso, cuellos de
// botella) — separado en dos piezas para poder acomodarlas en distintos
// layouts (la card las mezcla con el badge de fase y el avatar del PM en una
// misma fila; /projects/[id] las apila aparte) sin duplicar el JSX.

// Holgura/retraso REAL (plannedEnd vs. actualEnd de tareas ya completadas,
// ver getTaskScheduleVariance) — distinto del openSlackDays de al lado
// (margen estructural CPM de las tareas todavía abiertas). Positivo =
// terminaron adelantadas en conjunto, negativo = atrasadas. null = ninguna
// tarea completada todavía en ese alcance.
export function ScheduleVarianceBadge({ days }: { days: number | null }) {
  if (days === null || days === 0) return null;
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
        days > 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
      }`}
    >
      {days > 0 ? `+${days}d holgura` : `${days}d retraso`}
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
  openSlackDays = null,
  scheduleVarianceDays = null,
}: {
  projectId: string;
  health: keyof typeof HEALTH_LABEL;
  overdueCount: number;
  overdueTasks: { id: string; title: string }[];
  warningCount: number;
  warningTasks: { id: string; title: string }[];
  openSlackDays?: number | null;
  scheduleVarianceDays?: number | null;
}) {
  return (
    <>
      {health === "ok" ? (
        <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${HEALTH_STYLE.ok}`}>
          {HEALTH_LABEL.ok}
          {openSlackDays !== null && openSlackDays !== 0 && ` · ${openSlackDays}d de holgura`}
        </span>
      ) : (
        <ProjectAlertLink
          projectId={projectId}
          risk="overdue"
          items={overdueTasks.map((t) => ({ id: t.id, label: t.title, href: `/projects/${projectId}/tasks/${t.id}` }))}
          className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium hover:brightness-95 ${HEALTH_STYLE[health]}`}
        >
          {HEALTH_LABEL[health]} · {overdueCount} atrasada{overdueCount > 1 ? "s" : ""}
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
