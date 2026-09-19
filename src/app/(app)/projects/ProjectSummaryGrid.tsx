import { Avatar } from "@/components/Avatar";
import { ComboFilter } from "@/components/ComboFilter";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { OverlapIcon } from "@/components/icons";
import { ResetFiltersButton } from "@/components/ResetFiltersButton";
import { ModalTrigger } from "@/components/Modal";
import { ProjectIcon } from "@/components/ProjectIcon";
import { ProjectHealthBadges, ProjectProgress } from "@/components/ProjectSummary";
import { ReferencePopover } from "@/components/ReferencePopover";
import { HEALTH_LABEL } from "@/lib/projectHealth";
import type { ProjectSummaryRow } from "@/lib/projectSummaries";
import { PROJECT_PHASE_LABEL } from "@/lib/statusColors";
import Link from "next/link";
import { NavLinkWithMemory } from "../NavLinkWithMemory";
import { CreateProjectForm } from "./CreateProjectForm";
import { ProjectCardsOrder } from "./ProjectCardsOrder";

// La "vista resumen" de /projects (card de proyecto con salud/progreso/
// alertas + el filtro Buscar/Alerta + el orden "recientes") — extraída para
// poder reusarla tal cual en el bloque "Mis proyectos" de Agenda, con la
// única diferencia real siendo QUÉ proyectos entran en `rows` (ver
// getProjectSummaryRows) y el `basePath`/params para que sus links de filtro
// no choquen con los de la página que la usa.
export async function ProjectSummaryGrid({
  rows,
  basePath,
  pid,
  health,
  currentParams,
  users,
  projectShareTokenById = new Map(),
  showCreateButton = true,
}: {
  rows: ProjectSummaryRow[];
  basePath: string;
  pid?: string;
  health?: "ok" | "warn" | "bad";
  currentParams: Record<string, string | undefined>;
  users: { id: string; name: string }[];
  projectShareTokenById?: Map<string, string>;
  showCreateButton?: boolean;
}) {
  function href(overrides: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    const merged: Record<string, string | undefined> = { ...currentParams, pid, health, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
    }
    const qs = p.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  }

  const visibleRows = rows
    .filter(({ summary }) => !health || summary.health === health)
    .filter(({ project }) => !pid || pid === "all" || project.id === pid);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3">
        <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Buscar</span>
            <ComboFilter
              allLabel="Recientes"
              value={pid}
              pinnedOptions={[{ id: "all", label: "Todos los proyectos" }]}
              options={rows.map(({ project: p }) => ({ id: p.id, label: p.name }))}
              paramKey="pid"
              basePath={basePath}
              currentParams={{ ...currentParams, health }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Alerta</span>
            <ComboFilter
              allLabel="Toda la salud"
              value={health}
              options={[
                { id: "ok", label: HEALTH_LABEL.ok, dotColorClass: "bg-emerald-500" },
                { id: "warn", label: HEALTH_LABEL.warn, dotColorClass: "bg-amber-500" },
                { id: "bad", label: HEALTH_LABEL.bad, dotColorClass: "bg-red-500" },
              ]}
              paramKey="health"
              basePath={basePath}
              currentParams={{ ...currentParams, pid }}
              triggerColorClass={
                health === "bad" ? "bg-red-600 text-white" : health === "warn" ? "bg-amber-500 text-white" : health === "ok" ? "bg-emerald-600 text-white" : undefined
              }
            />
          </div>
          <ResetFiltersButton count={[pid, health].filter(Boolean).length} href={href({ pid: undefined, health: undefined })} />
          {/* Acceso directo al final de la fila (además de la opción dentro del filtro): texto subrayado, no botón. */}
          {pid !== "all" && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">&nbsp;</span>
              <Link href={href({ pid: "all" })} scroll={false} className="py-1.5 text-sm text-slate-600 underline underline-offset-2 hover:text-[#0a6b78]">
                Ver todos los proyectos
              </Link>
            </div>
          )}
        </div>
        {showCreateButton && (
          <ModalTrigger label="+ Nuevo proyecto" title="Nuevo proyecto">
            <CreateProjectForm users={users} />
          </ModalTrigger>
        )}
      </div>

      <div className="grid max-h-110 grid-cols-1 gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
        {visibleRows.length === 0 && (
          <p className="text-sm text-slate-500 sm:col-span-2">
            {pid ? "Ningún proyecto coincide con la búsqueda." : health ? "Ningún proyecto tiene esta salud." : "Todavía no tenés proyectos."}
          </p>
        )}
        <ProjectCardsOrder
          limit={pid || health ? undefined : 2}
          items={visibleRows.map(({ project: p, summary }) => {
            const { overdueCount, warningCount, lateStartCount, overdueTasks, warningTasks, lateStartTasks, bottlenecks, total, completed, health: projHealth, phase, collisionTasks, openSlackDays, scheduleVarianceDays } = summary;
            return {
              id: p.id,
              node: (
                <NavLinkWithMemory
                  href={`/projects/${p.id}`}
                  storageKey={`project:${p.id}`}
                  className="block h-full rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <ProjectIcon name={p.name} iconUrl={p.iconUrl} size="h-12 w-12 text-base" />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-medium text-slate-900">
                          <span className="truncate">{p.name}</span>
                          {collisionTasks.length > 0 && (
                            <ReferencePopover
                              trigger={<OverlapIcon className="h-3.5 w-3.5 flex-shrink-0 text-indigo-500" />}
                              hoverText="Alguna de sus tareas coincide en fechas con otro proyecto (misma persona)"
                              items={collisionTasks.map((t) => ({ id: t.id, label: t.title, href: `/collisions/${t.id}` }))}
                              filteredHref="/projects?collision=1"
                              filteredLabel="Ver todas las colisiones"
                            />
                          )}
                          {projectShareTokenById.get(p.id) && <CopyLinkButton token={projectShareTokenById.get(p.id)!} />}
                        </p>
                        <p className="text-sm text-slate-500">{p.clientName ?? "Interno"}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ProjectHealthBadges
                        projectId={p.id}
                        health={projHealth}
                        overdueCount={overdueCount}
                        overdueTasks={overdueTasks}
                        warningCount={warningCount}
                        warningTasks={warningTasks}
                        lateStartCount={lateStartCount}
                        lateStartTasks={lateStartTasks}
                        openSlackDays={openSlackDays}
                        scheduleVarianceDays={scheduleVarianceDays}
                      />
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{PROJECT_PHASE_LABEL[phase]}</span>
                      <Avatar name={p.pm.name} avatarUrl={p.pm.avatarUrl} size="h-7 w-7 text-[11px]" />
                    </div>
                  </div>
                  <div className="mt-2">
                    <ProjectProgress projectId={p.id} bottlenecks={bottlenecks} total={total} completed={completed} />
                  </div>
                </NavLinkWithMemory>
              ),
            };
          })}
        />
      </div>
    </div>
  );
}
