"use client";

import { TASK_STATUS_COLOR } from "@/lib/statusColors";
import { PaperclipIcon, SearchIcon, WarningIcon, OverlapIcon } from "@/components/icons";
import { TodayMarker } from "./TodayMarker";
import { GanttBar, GANTT_TOOLTIP_LAYER_ID } from "./GanttBar";
import { ProjectIcon } from "@/components/ProjectIcon";
import { ReferencePopover } from "@/components/ReferencePopover";
import type { TaskAlert } from "@/lib/delays";
import type { CollisionInfo } from "@/lib/collisions";

const DAY_WIDTH = 28;
const LABEL_WIDTH = 260;

export type GanttTask = {
  id: string;
  projectId: string;
  projectName: string;
  projectIconUrl: string | null;
  title: string;
  phaseId: string;
  phaseName: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";
  startIndex: number;
  span: number;
  minStartIndex: number;
  plannedStart: string;
  plannedEnd: string;
  dependsOn: string[];
  dependsOnLinks: { id: string; type: "FINISH_TO_START" | "START_TO_START" }[];
  blocks: string[];
  blockedSuccessors: { id: string; title: string }[];
  attachmentsCount: number;
  alert: TaskAlert;
  bottleneckReason: string | null;
  collidesWith: CollisionInfo[] | null;
};

const TASK_ROW_HEIGHT = 32;
const PHASE_ROW_HEIGHT = 40;

// Punto 6/7: el color de la barra prioriza la señal de riesgo (atrasada /
// por vencer) sobre el estado crudo — así una tarea "en curso" que ya se
// pasó de fecha se ve roja, no azul, igual que en las cards y la agenda.
function barColor(task: GanttTask) {
  if (task.status === "COMPLETED") return TASK_STATUS_COLOR.COMPLETED.bar;
  if (task.status === "BLOCKED") return TASK_STATUS_COLOR.BLOCKED.bar;
  if (task.alert.level === "overdue") return "bg-red-500";
  if (task.alert.level === "warning") return "bg-amber-500";
  return TASK_STATUS_COLOR[task.status].bar;
}

type DependencyEdge = { x1: number; y1: number; x2: number; y2: number; type: "FINISH_TO_START" | "START_TO_START" };

// Forma clásica de conector de Gantt (Smartsheet/MS Project): sale de la
// predecesora hacia ADELANTE, baja a la mitad del tramo, se ubica justo
// detrás del inicio de la sucesora (esto implica retroceder cuando las
// filas están pegadas, como en una cadena de tareas de un día), baja el
// resto, y entra siempre de frente — la flecha nunca apunta hacia atrás.
function dependencyPath(e: DependencyEdge) {
  if (e.type === "START_TO_START") {
    // Arrancan el mismo día: el desvío va a la IZQUIERDA (espacio vacío
    // antes de la barra) — a la derecha quedaría tapado bajo las barras,
    // que son más anchas que el desvío. Se aleja lo suficiente para que la
    // flecha final no quede pegada al borde de la barra.
    const midX = Math.max(2, e.x1 - 20);
    return `M ${e.x1} ${e.y1} L ${midX} ${e.y1} L ${midX} ${e.y2} L ${e.x2 - 1} ${e.y2}`;
  }
  const yMid = (e.y1 + e.y2) / 2;
  const exitX = e.x1 + 10;
  // El retroceso llega más lejos que el punto de entrada final, para que el
  // último tramo (recto, hacia la barra) tenga largo visible y la flecha no
  // quede pegada al borde — sin agregar más quiebres que los necesarios.
  const entryX = e.x2 - 20;
  return `M ${e.x1} ${e.y1} L ${exitX} ${e.y1} L ${exitX} ${yMid} L ${entryX} ${yMid} L ${entryX} ${e.y2} L ${e.x2 - 1} ${e.y2}`;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("es-CO", { month: "short", timeZone: "UTC" }).replace(".", "").toUpperCase();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", timeZone: "UTC" });
}

// Botón lupa (aparece al hover del renglón) → lleva el scroll horizontal
// hasta la barra de esa tarea.
function scrollToBar(taskId: string) {
  document.getElementById(`gantt-bar-${taskId}`)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
}

export function GanttView({
  businessDays,
  tasks,
  canManage,
}: {
  businessDays: Date[];
  tasks: GanttTask[];
  canManage: boolean;
}) {
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const todayIndex = businessDays.findIndex((d) => d.toISOString().slice(0, 10) === todayKey);
  const todayLabel = fmtDate(today.toISOString());
  const businessDaysISO = businessDays.map((d) => d.toISOString());
  const maxEndIndex = businessDays.length - 1;

  const monthGroups: { label: string; count: number }[] = [];
  for (const day of businessDays) {
    const label = monthLabel(day);
    const last = monthGroups[monthGroups.length - 1];
    if (last && last.label === label) last.count += 1;
    else monthGroups.push({ label, count: 1 });
  }

  const grouped = new Map<string, GanttTask[]>();
  for (const t of tasks) {
    const key = `${t.projectId}:${t.phaseId}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(t);
  }

  const timelineWidth = businessDays.length * DAY_WIDTH;

  // Posición vertical (centro de fila) de cada tarea, para poder dibujar el
  // conector de dependencia entre el fin de una barra y el inicio de la
  // siguiente sin importar en qué fase/fila esté cada una.
  const rowCenterY = new Map<string, number>();
  let cursorY = 0;
  for (const phaseTasks of grouped.values()) {
    cursorY += PHASE_ROW_HEIGHT;
    for (const t of phaseTasks) {
      rowCenterY.set(t.id, cursorY + TASK_ROW_HEIGHT / 2);
      cursorY += TASK_ROW_HEIGHT;
    }
  }
  const totalRowsHeight = cursorY;

  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const dependencyEdges = tasks.flatMap((t) =>
    t.dependsOnLinks
      .map((link) => {
        const pred = taskById.get(link.id);
        return pred ? { pred, type: link.type } : null;
      })
      .filter((e): e is { pred: GanttTask; type: "FINISH_TO_START" | "START_TO_START" } => Boolean(e))
      .map(({ pred, type }) => ({
        // "en paralelo" (START_TO_START) conecta inicio con inicio; el resto
        // (FINISH_TO_START) conecta el fin de la predecesora con el inicio
        // de la sucesora, como cualquier Gantt.
        x1: type === "START_TO_START" ? pred.startIndex * DAY_WIDTH : (pred.startIndex + pred.span) * DAY_WIDTH - 4,
        y1: rowCenterY.get(pred.id)!,
        x2: t.startIndex * DAY_WIDTH,
        y2: rowCenterY.get(t.id)!,
        type,
      }))
  );

  return (
    <>
    {/* Alto = el espacio que sobra en la pantalla (punto confirmado con el
        usuario, revierte el criterio anterior de "sin tope, un solo scroll
        de página"): el padre (page.tsx) es flex-col con altura fija
        100vh-header y este bloque es el único flex-1, así que "h-full" ya
        resuelve exactamente 100vh menos header y menos todo el contenido de
        arriba (breadcrumb, título, tabs, filtros) — el Gantt scrollea
        internamente en ambos ejes dentro de ese alto. */}
    <div className="h-full overflow-x-auto overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-xl border border-slate-200 bg-white mb-0">
      <div style={{ minWidth: LABEL_WIDTH + timelineWidth }}>
        {/* Header: meses — sticky verticalmente (debajo del header fijo del
            programa), siempre visible aunque haya muchas fases/tareas debajo. */}
        <div className="sticky top-0 z-40 flex border-b border-slate-200 bg-white text-xs font-medium text-slate-500">
          <div style={{ width: LABEL_WIDTH }} className="sticky left-0 z-10 flex-shrink-0 bg-white px-3 py-2">
            Tarea
          </div>
          <div className="flex">
            {monthGroups.map((m, i) => (
              <div
                key={i}
                style={{ width: m.count * DAY_WIDTH }}
                className="border-l border-slate-100 py-2 text-center"
              >
                {m.label}
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          {Array.from(grouped.entries()).map(([groupKey, phaseTasks]) => {
            const completed = phaseTasks.filter((t) => t.status === "COMPLETED").length;
            const phasePct = Math.round((completed / phaseTasks.length) * 100);
            const phaseStart = Math.min(...phaseTasks.map((t) => t.startIndex));
            const phaseEnd = Math.max(...phaseTasks.map((t) => t.startIndex + t.span));
            const phaseHasOverdue = phaseTasks.some((t) => t.alert.level === "overdue");
            const first = phaseTasks[0];

            return (
              <div key={groupKey}>
                <div
                  className="flex items-center bg-slate-50"
                  style={{ minWidth: LABEL_WIDTH + timelineWidth, height: PHASE_ROW_HEIGHT }}
                >
                  <div className="sticky left-0 z-30 flex flex-shrink-0 items-center gap-1.5 self-stretch bg-slate-50 px-3 py-1.5" style={{ width: LABEL_WIDTH }}>
                    <ProjectIcon name={first.projectName} iconUrl={first.projectIconUrl} size="h-5 w-5 flex-shrink-0 text-[9px]" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-600" title={first.phaseName}>{first.phaseName}</p>
                      <p className="text-[10px] text-slate-400">{phasePct}% completado</p>
                    </div>
                  </div>
                  <div className="relative flex-1" style={{ width: timelineWidth, height: PHASE_ROW_HEIGHT }}>
                    <div
                      className="absolute top-1/2 h-4 -translate-y-1/2 overflow-hidden rounded-full bg-slate-200"
                      style={{ left: phaseStart * DAY_WIDTH, width: (phaseEnd - phaseStart) * DAY_WIDTH }}
                    >
                      <div
                        className={phaseHasOverdue ? "h-full bg-red-400" : "h-full bg-emerald-400"}
                        style={{ width: `${phasePct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {phaseTasks.map((t) => (
                  <div
                    key={t.id}
                    className="group flex items-center border-t border-slate-100"
                    style={{ height: TASK_ROW_HEIGHT }}
                  >
                    <div
                      style={{ width: LABEL_WIDTH }}
                      className="sticky left-0 z-30 flex h-full flex-shrink-0 items-center gap-1 bg-white pl-3 pr-1 text-sm text-slate-700"
                    >
                      <a
                        href={`/projects/${t.projectId}/tasks/${t.id}`}
                        className="flex min-w-0 flex-1 items-center gap-1 truncate hover:underline"
                        title={t.title}
                      >
                        <span className="truncate">{t.title}</span>
                      </a>
                      {t.bottleneckReason && (
                        <ReferencePopover
                          trigger={<WarningIcon className="h-3 w-3 flex-shrink-0 text-amber-500" />}
                          hoverText={`Cuello de botella — ${t.bottleneckReason}`}
                          items={t.blockedSuccessors.map((s) => ({
                            id: s.id,
                            label: s.title,
                            href: `/projects/${t.projectId}/tasks/${s.id}`,
                          }))}
                        />
                      )}
                      {t.collidesWith && t.collidesWith.length > 0 && (
                        <ReferencePopover
                          trigger={<OverlapIcon className="h-3 w-3 flex-shrink-0 text-indigo-500" />}
                          hoverText={`Coincide en fechas con: ${t.collidesWith.map((c) => `${c.title} (${c.projectName})`).join(", ")}`}
                          items={t.collidesWith.map((c) => ({
                            id: c.taskId,
                            label: `${c.title} (${c.projectName})`,
                            href: `/projects/${c.projectId}/tasks/${c.taskId}`,
                          }))}
                          filteredHref="/projects?collision=1"
                          filteredLabel="Ver todas las colisiones"
                        />
                      )}
                      {t.attachmentsCount > 0 && (
                        <PaperclipIcon className="h-3 w-3 flex-shrink-0 text-slate-400" />
                      )}
                      <button
                        type="button"
                        onClick={() => scrollToBar(t.id)}
                        title="Ir a la barra de esta tarea"
                        aria-label="Ir a la barra de esta tarea"
                        className="flex-shrink-0 rounded p-1 text-slate-400 opacity-0 hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100"
                      >
                        <SearchIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="relative" style={{ width: timelineWidth, height: TASK_ROW_HEIGHT }}>
                      {todayIndex >= 0 && (
                        <TodayMarker left={todayIndex * DAY_WIDTH + DAY_WIDTH / 2} label={todayLabel} />
                      )}
                      <GanttBar
                        key={`${t.id}:${t.plannedStart}:${t.plannedEnd}`}
                        taskId={t.id}
                        projectId={t.projectId}
                        title={t.title}
                        color={barColor(t)}
                        startIndex={t.startIndex}
                        span={t.span}
                        minStartIndex={t.minStartIndex}
                        maxEndIndex={maxEndIndex}
                        businessDaysISO={businessDaysISO}
                        plannedStart={t.plannedStart}
                        plannedEnd={t.plannedEnd}
                        dependsOn={t.dependsOn}
                        blocks={t.blocks}
                        attachmentsCount={t.attachmentsCount}
                        alert={t.alert}
                        canResize={canManage}
                      />
                    </div>
                  </div>
                ))}
              </div>
            );
          })}

          {/* Conectores de dependencia — mismo lenguaje visual que cualquier
              Gantt (Smartsheet/MS Project): línea sólida "termina antes de
              que esta empiece", punteada "en paralelo" (mismo inicio).
              pointer-events-none para no robarle el drag/click a las barras. */}
          <svg
            className="pointer-events-none absolute top-0 z-10"
            style={{ left: LABEL_WIDTH, width: timelineWidth, height: totalRowsHeight }}
          >
            <defs>
              <marker id="gantt-dep-arrow" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L8,4 L0,8 Z" fill="#94a3b8" />
              </marker>
            </defs>
            {dependencyEdges.map((e, i) => (
              <path
                key={i}
                d={dependencyPath(e)}
                fill="none"
                stroke="#94a3b8"
                strokeWidth={1.5}
                strokeDasharray={e.type === "START_TO_START" ? "3 3" : undefined}
                markerEnd="url(#gantt-dep-arrow)"
              />
            ))}
          </svg>

        </div>

        {tasks.length === 0 && (
          <p className="p-4 text-sm text-slate-400">Todavía no hay tareas para graficar.</p>
        )}
      </div>
    </div>

      {/* Tooltips (barras y "hoy") se portalean acá — ver GanttBar y
          TodayMarker. `fixed inset-0` a propósito, FUERA del contenedor de
          arriba (que ahora sí tiene scroll propio, horizontal Y vertical,
          por el encabezado sticky): si el tooltip viviera adentro, uno que
          se desborde en la última fila quedaría recortado por ese scroll en
          vez de mostrarse completo por encima de todo. */}
      <div id={GANTT_TOOLTIP_LAYER_ID} className="pointer-events-none fixed inset-0 z-40" />
    </>
  );
}
