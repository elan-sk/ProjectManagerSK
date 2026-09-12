"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { resizeTask, moveTask } from "./actions";
import { AlertBadge } from "@/components/AlertBadge";
import { useToast } from "@/components/Toast";
import type { TaskAlert } from "@/lib/delays";

const DAY_WIDTH = 28;
// Estimado (no medido) de la altura máxima del tooltip, con todas sus líneas
// opcionales — mismo criterio ya usado para el flip horizontal de
// ReferencePopover (constante fija, no medición real). Sirve para decidir si
// entra debajo de la barra o hay que dibujarlo arriba.
const TOOLTIP_MAX_HEIGHT = 170;
const TOOLTIP_WIDTH = 256; // w-64

// Cada fila del Gantt es su propio contexto de apilamiento (position:
// relative), así que un z-index alto en el tooltip no alcanza a competir
// contra la barra de la fila SIGUIENTE cuando el tooltip se desborda hacia
// abajo — un z-index solo gana dentro del mismo contexto. Portalear el
// tooltip a esta capa de nivel superior (ver GanttView) lo saca de ese
// problema por completo.
export const GANTT_TOOLTIP_LAYER_ID = "gantt-tooltip-layer";

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", timeZone: "UTC" });
}

export function GanttBar({
  taskId,
  projectId,
  title,
  color,
  status,
  startIndex,
  span,
  minStartIndex,
  maxEndIndex,
  businessDaysISO,
  plannedStart,
  plannedEnd,
  dependsOn,
  blocks,
  attachmentsCount,
  alert: taskAlert,
  canResize,
  highlighted,
  critical,
  criticalSelected,
  selected,
  onToggleSelect,
  groupArmed,
  moveOffsetIndex,
  onGroupDragStart,
  onGroupDragMove,
  onGroupDragEnd,
}: {
  taskId: string;
  projectId: string;
  title: string;
  color: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "RETURNED";
  startIndex: number;
  span: number;
  minStartIndex: number;
  maxEndIndex: number;
  businessDaysISO: string[];
  plannedStart: string;
  plannedEnd: string;
  dependsOn: string[];
  blocks: string[];
  attachmentsCount: number;
  alert: TaskAlert;
  canResize: boolean;
  highlighted?: boolean;
  critical?: boolean;
  criticalSelected?: boolean;
  selected?: boolean;
  onToggleSelect?: (multi: boolean) => void;
  // Arrastre en grupo (varias tareas seleccionadas moviéndose juntas): estos
  // tres callbacks son íntegramente responsabilidad de GanttView (es la
  // única que puede mover las barras HERMANAS a la vez) — ver comentario en
  // GanttView. moveOffsetIndex es el desplazamiento visual en vivo mientras
  // ese arrastre está en curso, aplicado por igual a cada barra del grupo.
  groupArmed?: boolean;
  moveOffsetIndex?: number;
  onGroupDragStart?: (e: React.PointerEvent) => void;
  onGroupDragMove?: (e: React.PointerEvent) => void;
  onGroupDragEnd?: (e: React.PointerEvent) => void;
}) {
  const router = useRouter();
  const showToast = useToast();
  const [, startTransition] = useTransition();
  const endIndex = startIndex + span - 1;
  const barRef = useRef<HTMLDivElement>(null);

  // Restricciones confirmadas con el usuario: la fecha de inicio ya no se
  // toca en cuanto la tarea deja "sin iniciar" (arrancó de verdad, moverla
  // sería reescribir el pasado); la fecha de fin ya no se toca una vez
  // COMPLETED (ver displayEnd en page.tsx/GanttView — esa barra ya se dibuja
  // con actualEnd, no con este plannedEnd). resizeTask valida lo mismo en el
  // servidor, esto solo evita el intento en la UI.
  const canResizeStart = canResize && status === "NOT_STARTED";
  const canResizeEnd = canResize && status !== "COMPLETED";
  // Mover la barra completa reescribe el inicio igual que el handle
  // izquierdo, así que aplica la misma restricción (punto confirmado con el
  // usuario): solo tareas que todavía no arrancaron.
  const canMove = canResize && status === "NOT_STARTED";

  const [dragging, setDragging] = useState<"left" | "right" | "body" | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [liveStartIndex, setLiveStartIndex] = useState(startIndex);
  const [liveEndIndex, setLiveEndIndex] = useState(endIndex);
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);
  // Distingue un click real (seleccionar/abrir) de un click que en realidad
  // fue el final de un arrastre del cuerpo — el evento click del navegador
  // se sigue disparando después del pointerup aunque haya habido movimiento.
  const draggedBodyRef = useRef(false);

  // liveStartIndex/liveEndIndex son siempre lo que se muestra: se actualizan
  // al instante mientras se arrastra Y se quedan ahí después de soltar, sin
  // esperar la respuesta del server — evita el salto visual de "vuelve a la
  // posición vieja mientras piensa". Se resincronizan solas desde las props
  // cuando el server confirma el nuevo valor (o quedan como están si
  // coincide, sin parpadeo); en caso de error, onHandleUp las revierte a mano.
  useEffect(() => {
    setLiveStartIndex(startIndex);
  }, [startIndex]);
  useEffect(() => {
    setLiveEndIndex(endIndex);
  }, [endIndex]);

  function showTooltip() {
    const bar = barRef.current;
    const container = document.getElementById(GANTT_TOOLTIP_LAYER_ID);
    if (!bar || !container) return;
    const barRect = bar.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    // Si no entra debajo de la barra, se dibuja arriba en su lugar (bug
    // real: en filas cerca del fondo del viewport quedaba cortado/oculto).
    const fitsBelow = window.innerHeight - barRect.bottom >= TOOLTIP_MAX_HEIGHT + 8;
    const top = fitsBelow
      ? barRect.bottom - containerRect.top + 8
      : barRect.top - containerRect.top - TOOLTIP_MAX_HEIGHT - 8;
    // Clamp horizontal: barras cerca del borde izquierdo/derecho del Gantt
    // (mismo criterio que ReferencePopover) para que el tooltip no se corte.
    const left = clamp(
      barRect.left - containerRect.left,
      8,
      containerRect.width - TOOLTIP_WIDTH - 8
    );
    setTooltipPos({ left, top });
  }

  function hideTooltip() {
    setTooltipPos(null);
  }

  function onHandleDown(e: React.PointerEvent, edge: "left" | "right") {
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Puntero ya no activo (soltado justo antes, o evento no confiable) —
      // el arrastre igual funciona vía los listeners normales del handle.
    }
    setDragging(edge);
    setDragStartX(e.clientX);
    setLiveStartIndex(startIndex);
    setLiveEndIndex(endIndex);
  }

  function onHandleMove(e: React.PointerEvent, edge: "left" | "right") {
    if (dragging !== edge) return;
    const deltaDays = Math.round((e.clientX - dragStartX) / DAY_WIDTH);
    if (edge === "left") {
      setLiveStartIndex(clamp(startIndex + deltaDays, minStartIndex, endIndex));
    } else {
      setLiveEndIndex(clamp(endIndex + deltaDays, startIndex, maxEndIndex));
    }
  }

  function onHandleUp(e: React.PointerEvent, edge: "left" | "right") {
    if (dragging !== edge) return;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // idem onHandleDown
    }
    setDragging(null);

    if (edge === "left" && liveStartIndex !== startIndex) {
      const newDateISO = businessDaysISO[liveStartIndex];
      startTransition(async () => {
        const result = await resizeTask(taskId, "start", newDateISO);
        if (!result.ok) {
          setLiveStartIndex(startIndex);
          showToast(result.error ?? "Ocurrió un error.");
        } else {
          router.refresh();
        }
      });
    } else if (edge === "right" && liveEndIndex !== endIndex) {
      const newDateISO = businessDaysISO[liveEndIndex];
      startTransition(async () => {
        const result = await resizeTask(taskId, "end", newDateISO);
        if (!result.ok) {
          setLiveEndIndex(endIndex);
          showToast(result.error ?? "Ocurrió un error.");
        } else {
          router.refresh();
        }
      });
    }
  }

  // Arrastre del CUERPO de la barra (mover la tarea completa, no un
  // extremo): desplaza inicio y fin juntos, sin cambiar la duración. Cuando
  // esta barra forma parte de una selección con el modo grupo armado
  // (groupArmed), el arrastre entero pasa a manos de GanttView en vez de
  // manejarse acá — ver comentario junto a esos props.
  function onBodyDown(e: React.PointerEvent) {
    if (groupArmed) {
      onGroupDragStart?.(e);
      return;
    }
    if (!canMove) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // idem onHandleDown
    }
    draggedBodyRef.current = false;
    setDragging("body");
    setDragStartX(e.clientX);
    setLiveStartIndex(startIndex);
    setLiveEndIndex(endIndex);
  }

  function onBodyMove(e: React.PointerEvent) {
    if (groupArmed) {
      onGroupDragMove?.(e);
      return;
    }
    if (dragging !== "body") return;
    const deltaDays = Math.round((e.clientX - dragStartX) / DAY_WIDTH);
    if (deltaDays === 0) return;
    draggedBodyRef.current = true;
    const clampedDelta = clamp(deltaDays, minStartIndex - startIndex, maxEndIndex - endIndex);
    setLiveStartIndex(startIndex + clampedDelta);
    setLiveEndIndex(endIndex + clampedDelta);
  }

  function onBodyUp(e: React.PointerEvent) {
    if (groupArmed) {
      onGroupDragEnd?.(e);
      return;
    }
    if (dragging !== "body") return;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // idem onHandleDown
    }
    setDragging(null);
    if (liveStartIndex === startIndex) return;

    const newDateISO = businessDaysISO[liveStartIndex];
    startTransition(async () => {
      const result = await moveTask(taskId, newDateISO);
      if (!result.ok) {
        setLiveStartIndex(startIndex);
        setLiveEndIndex(endIndex);
        showToast(result.error ?? "Ocurrió un error.");
      } else {
        router.refresh();
      }
    });
  }

  function onBodyClick(e: React.MouseEvent) {
    // El click del navegador se dispara después del pointerup aunque haya
    // habido arrastre — si esto era en realidad el final de un drag del
    // cuerpo, no lo tratamos como un click de selección.
    if (draggedBodyRef.current) {
      draggedBodyRef.current = false;
      return;
    }
    onToggleSelect?.(e.ctrlKey || e.metaKey);
  }

  const displayStartIndex = liveStartIndex + (moveOffsetIndex ?? 0);
  const displayEndIndex = liveEndIndex + (moveOffsetIndex ?? 0);
  const left = displayStartIndex * DAY_WIDTH;
  const liveSpan = Math.max(displayEndIndex - displayStartIndex + 1, 1);
  const width = liveSpan * DAY_WIDTH - 4;

  const tooltipLayer = typeof document !== "undefined" ? document.getElementById(GANTT_TOOLTIP_LAYER_ID) : null;

  return (
    <div
      ref={barRef}
      id={`gantt-bar-${taskId}`}
      className={`absolute top-1.5 z-20 h-5 rounded ${color} ${dragging ? "" : "cursor-pointer"} ${
        selected ? "ring-2 ring-amber-500 ring-offset-1" : highlighted ? "ring-2 ring-indigo-500 ring-offset-1" : ""
      }`}
      style={{
        left,
        width,
        outline: criticalSelected ? "2px solid #c026d3" : critical ? "1.5px solid #475569" : "none",
        outlineOffset: criticalSelected || critical ? "1px" : undefined,
      }}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
    >
      <div
        role="button"
        className={`block h-full w-full overflow-hidden rounded ${
          canMove || groupArmed ? (dragging === "body" ? "cursor-grabbing" : "cursor-grab") : ""
        }`}
        tabIndex={0}
        aria-label={title}
        aria-pressed={selected}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        onPointerDown={onBodyDown}
        onPointerMove={onBodyMove}
        onPointerUp={onBodyUp}
        onClick={onBodyClick}
        onDoubleClick={() => router.push(`/projects/${projectId}/tasks/${taskId}`)}
      >
        <span className="pointer-events-none flex h-full w-full select-none items-center justify-center text-[10px] font-semibold text-white/90">
          {liveSpan}d
        </span>
      </div>

      {tooltipPos &&
        tooltipLayer &&
        createPortal(
          <div
            className="pointer-events-none absolute z-10 w-64 rounded-xl bg-white p-3 text-xs shadow-[0_4px_8px_rgba(15,23,42,0.08),0_16px_40px_rgba(15,23,42,0.12)]"
            style={{ left: tooltipPos.left, top: tooltipPos.top }}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-slate-900">{title}</p>
              <AlertBadge alert={taskAlert} className="flex-shrink-0" />
            </div>
            <p className="mt-1 text-slate-500">
              {fmtDate(plannedStart)} — {fmtDate(plannedEnd)} · {liveSpan} día{liveSpan !== 1 ? "s" : ""} hábil
              {liveSpan !== 1 ? "es" : ""}
              {taskAlert.level === "onTrack" && ` · vence en ${taskAlert.daysRemaining}d`}
            </p>
            {dependsOn.length > 0 && <p className="mt-1 text-slate-500">Depende de: {dependsOn.join(", ")}</p>}
            {blocks.length > 0 && <p className="mt-1 text-slate-500">Sigue: {blocks.join(", ")}</p>}
            {attachmentsCount > 0 && <p className="mt-1 text-slate-500">{attachmentsCount} adjunto(s)</p>}
            {onToggleSelect && (
              <p className="mt-1.5 text-[11px] text-slate-400">
                Click para seleccionar
                {canResize && " · arrastrá los extremos para ajustar fechas"}
                {canMove && " · arrastrá el cuerpo para mover toda la tarea"}
              </p>
            )}
          </div>,
          tooltipLayer
        )}

      {canResizeStart && (
        <div
          role="slider"
          aria-label={`Mover fecha de inicio de ${title}`}
          aria-valuenow={liveStartIndex}
          tabIndex={-1}
          onPointerDown={(e) => onHandleDown(e, "left")}
          onPointerMove={(e) => onHandleMove(e, "left")}
          onPointerUp={(e) => onHandleUp(e, "left")}
          className="absolute top-0 left-0 h-full w-2 cursor-ew-resize rounded-l bg-black/0 hover:bg-black/15"
        />
      )}
      {canResizeEnd && (
        <div
          role="slider"
          aria-label={`Mover fecha de fin de ${title}`}
          aria-valuenow={liveEndIndex}
          tabIndex={-1}
          onPointerDown={(e) => onHandleDown(e, "right")}
          onPointerMove={(e) => onHandleMove(e, "right")}
          onPointerUp={(e) => onHandleUp(e, "right")}
          className="absolute top-0 right-0 h-full w-2 cursor-ew-resize rounded-r bg-black/0 hover:bg-black/15"
        />
      )}
    </div>
  );
}
