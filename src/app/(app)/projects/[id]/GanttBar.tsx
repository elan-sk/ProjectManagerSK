"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { resizeTask } from "./actions";
import { AlertBadge } from "@/components/AlertBadge";
import type { TaskAlert } from "@/lib/delays";

const DAY_WIDTH = 28;

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
}: {
  taskId: string;
  projectId: string;
  title: string;
  color: string;
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
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const endIndex = startIndex + span - 1;
  const barRef = useRef<HTMLDivElement>(null);

  const [dragging, setDragging] = useState<"left" | "right" | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [liveStartIndex, setLiveStartIndex] = useState(startIndex);
  const [liveEndIndex, setLiveEndIndex] = useState(endIndex);
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);

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
    setTooltipPos({ left: barRect.left - containerRect.left, top: barRect.bottom - containerRect.top + 8 });
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
          alert(result.error);
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
          alert(result.error);
        } else {
          router.refresh();
        }
      });
    }
  }

  const left = liveStartIndex * DAY_WIDTH;
  const liveSpan = Math.max(liveEndIndex - liveStartIndex + 1, 1);
  const width = liveSpan * DAY_WIDTH - 4;

  const tooltipLayer = typeof document !== "undefined" ? document.getElementById(GANTT_TOOLTIP_LAYER_ID) : null;

  return (
    <div
      ref={barRef}
      id={`gantt-bar-${taskId}`}
      className={`absolute top-1.5 z-20 h-5 rounded outline-none ${color} ${dragging ? "" : "cursor-pointer"}`}
      style={{ left, width }}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
    >
      <a
        href={`/projects/${projectId}/tasks/${taskId}`}
        className="block h-full w-full overflow-hidden rounded"
        tabIndex={0}
        aria-label={title}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        <span className="pointer-events-none flex h-full w-full select-none items-center justify-center text-[10px] font-semibold text-white/90">
          {liveSpan}d
        </span>
      </a>

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
            <p className="mt-1.5 text-[11px] text-slate-400">
              {canResize ? "Click para ver el detalle · arrastrá los extremos para mover fechas" : "Click para ver el detalle"}
            </p>
          </div>,
          tooltipLayer
        )}

      {canResize && (
        <>
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
        </>
      )}
    </div>
  );
}
