"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { TASK_STATUS_COLOR } from "@/lib/statusColors";
import { PaperclipIcon, SearchIcon, WarningIcon, OverlapIcon } from "@/components/icons";
import { TodayMarker } from "./TodayMarker";
import { GanttBar, GANTT_TOOLTIP_LAYER_ID } from "./GanttBar";
import { ProjectIcon } from "@/components/ProjectIcon";
import { ReferencePopover } from "@/components/ReferencePopover";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { setDependency, removeDependency, deleteTask } from "./tasks/[taskId]/actions";
import { useConfirm } from "@/components/Confirm";
import { moveTaskGroup } from "./actions";
import { ModalShell } from "@/components/Modal";
import { InsertAdjacentTaskForm } from "./InsertAdjacentTaskForm";
import { CRITICAL_PATH_EVENT } from "./CriticalPathButton";
import { useToast } from "@/components/Toast";
import type { TaskAlert } from "@/lib/delays";
import type { CollisionInfo } from "@/lib/collisions";

const DAY_WIDTH = 28;
const LABEL_WIDTH = 260;
// Estimado (no medido) de la altura máxima del popup de ruta crítica —
// encabezado + hasta max-h-56 (224px) de lista + padding.
const CRITICAL_POPUP_MAX_HEIGHT = 260;

export type GanttTask = {
  id: string;
  projectId: string;
  projectName: string;
  projectIconUrl: string | null;
  title: string;
  phaseId: string;
  phaseName: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "RETURNED";
  // Punto 9: permiso de ESTA tarea (según su proyecto) — igual que en
  // KanbanBoard, nunca un booleano único para todo el panorama general.
  canManage: boolean;
  // Punto 12: mismo bloqueo optimista que KanbanBoard, ver assertNotStale.
  updatedAt: string;
  startIndex: number;
  span: number;
  minStartIndex: number;
  plannedStart: string;
  plannedEnd: string;
  dependsOn: string[];
  dependsOnLinks: { id: string; dependencyId: string; type: "FINISH_TO_START" | "START_TO_START" }[];
  blocks: string[];
  blockedSuccessors: { id: string; title: string }[];
  attachmentsCount: number;
  alert: TaskAlert;
  bottleneckReason: string | null;
  collidesWith: CollisionInfo[] | null;
  assignees: { name: string; avatarUrl: string | null }[];
  reviewers: { name: string; avatarUrl: string | null }[];
  tags: { id: string; name: string; colorHex: string; emoji: string | null }[];
  shareToken: string | null;
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

// businessDays no tiene fin de semana/feriados (ver businessDaysRange) — si
// "hoy" cae justo ahí, no hay ninguna columna donde dibujar la línea. En vez
// de que desaparezca, la anclamos al día hábil más próximo (antes o
// después, el que quede a menos días calendario). Array ya ordenado
// ascendente, así que bisectamos en vez de recorrerlo entero.
function closestBusinessDayIndex(days: Date[], targetKey: string): number {
  if (days.length === 0) return -1;
  const exact = days.findIndex((d) => d.toISOString().slice(0, 10) === targetKey);
  if (exact >= 0) return exact;
  const target = new Date(`${targetKey}T00:00:00.000Z`).getTime();
  let lo = 0;
  let hi = days.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (days[mid].getTime() < target) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return 0;
  if (lo === days.length) return days.length - 1;
  const distAfter = days[lo].getTime() - target;
  const distBefore = target - days[lo - 1].getTime();
  return distAfter <= distBefore ? lo : lo - 1;
}

type DependencyType = "FINISH_TO_START" | "START_TO_START";
type DependencyEdge = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: DependencyType;
  dependencyId: string;
  predecessorId: string;
  successorId: string;
};

// Extremo de flecha que se está reasignando arrastrando (punto 4 confirmado
// con el usuario): el otro extremo queda fijo, este sigue al puntero hasta
// soltar sobre una barra distinta.
type ReconnectState = {
  dependencyId: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  movingEnd: "pred" | "succ";
  fixedX: number;
  fixedY: number;
  pointerX: number;
  pointerY: number;
};

// Menú contextual (clic derecho): sobre una barra ofrece "Añadir
// predecesor/sucesor"; sobre un tramo de flecha, "Eliminar vínculo" —
// solo ese vínculo puntual, no toda una ruta.
type ContextMenuState =
  | { kind: "task"; taskId: string; x: number; y: number }
  | { kind: "edge"; dependencyId: string; successorId: string; x: number; y: number };

// Modo "conectar" activado desde el menú contextual: una línea sigue al
// puntero desde el extremo correspondiente de la tarea origen (fin si se
// agrega un sucesor, inicio si se agrega un predecesor) hasta que se hace
// clic sobre la tarea destino.
type ConnectState = {
  originTaskId: string;
  role: "predecessor" | "successor";
  originX: number;
  originY: number;
  pointerX: number;
  pointerY: number;
};

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

function dayLabel(date: Date) {
  return date.toLocaleDateString("es-CO", { day: "2-digit", timeZone: "UTC" });
}

function weekdayLabel(date: Date) {
  const weekday = date.toLocaleDateString("es-CO", { weekday: "long", timeZone: "UTC" });
  return weekday.charAt(0).toUpperCase() + weekday.slice(1);
}

// Botón lupa (aparece al hover del renglón) → lleva el scroll horizontal
// hasta la barra de esa tarea y la resalta un par de segundos (clase
// definida en globals.css) para que sea obvio cuál es, aunque quede lejos
// de donde estaba mirando el usuario.
function scrollToBar(taskId: string) {
  const el = document.getElementById(`gantt-bar-${taskId}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  el.classList.remove("gantt-flash");
  // Reinicia la animación aunque ya estuviera corriendo (doble click en la lupa).
  void el.offsetWidth;
  el.classList.add("gantt-flash");
  el.addEventListener("animationend", () => el.classList.remove("gantt-flash"), { once: true });
}

// Extrae el taskId de la barra que está bajo el puntero al soltar un
// arrastre (resize de barra en GanttBar, o reasignar flecha acá).
function taskIdAtPoint(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y)?.closest('[id^="gantt-bar-"]');
  return el ? el.id.replace("gantt-bar-", "") : null;
}

export function GanttView({
  businessDays,
  tasks,
  canManage,
  targetEndDate,
  users,
  collisionUrlBase = "/projects",
  focusCollision = false,
}: {
  businessDays: Date[];
  tasks: GanttTask[];
  canManage: boolean;
  targetEndDate?: string | null;
  users: { id: string; name: string; avatarUrl?: string | null }[];
  // Ver mismo comentario en KanbanBoard: base de "Ver mis colisiones", solo
  // relevante cuando la pasa /projects/page.tsx.
  collisionUrlBase?: string;
  // Punto 2: true cuando la URL trae ?collision=<taskId> (no el "1" genérico
  // de "Solo colisiones") — en ese caso `tasks` ya viene filtrado a solo las
  // tareas que chocan entre sí, y hace falta mover el scroll horizontal
  // hasta la fecha de inicio MÁS TEMPRANA de ese bloque, en vez de dejar al
  // usuario buscarlo a mano.
  focusCollision?: boolean;
}) {
  const router = useRouter();
  const showToast = useToast();
  const confirm = useConfirm();
  const [, startTransition] = useTransition();

  // Orden de filas "congelado" (confirmado con el usuario): el server ya
  // manda `tasks` ordenado por fecha de inicio, pero si cambiás la fecha de
  // una tarea de forma que le tocaría otra posición, no debe saltar ahí
  // mismo apenas se guarda (con la página todavía abierta) — solo al volver
  // a cargarla. Se captura el orden de ids una sola vez al montar; un
  // refresh posterior (router.refresh() tras guardar) solo actualiza los
  // DATOS de cada tarea (fecha, estado, etc.), nunca reordena filas
  // existentes. Tareas nuevas que no estaban se agregan al final; tareas
  // borradas se quitan. Volver a montar el componente (nueva carga de la
  // página) reinicia este estado con el orden fresco del server.
  const [rowOrder, setRowOrder] = useState<string[]>(() => tasks.map((t) => t.id));
  useEffect(() => {
    setRowOrder((prev) => {
      const currentIds = new Set(tasks.map((t) => t.id));
      const stillPresent = prev.filter((id) => currentIds.has(id));
      const newIds = tasks.map((t) => t.id).filter((id) => !prev.includes(id));
      if (newIds.length === 0 && stillPresent.length === prev.length) return prev;
      return [...stillPresent, ...newIds];
    });
  }, [tasks]);
  const taskByIdForOrder = new Map(tasks.map((t) => [t.id, t]));
  const orderedTasks = rowOrder.map((id) => taskByIdForOrder.get(id)).filter((t): t is GanttTask => Boolean(t));

  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const panRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [highlightedIds, setHighlightedIds] = useState<Set<string> | null>(null);
  const [reconnect, setReconnect] = useState<ReconnectState | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [connect, setConnect] = useState<ConnectState | null>(null);
  // "Crear predecesor"/"Crear sucesor" del menú contextual: a diferencia de
  // "Vincular" (modo connect, arriba), esto abre el popup de creación de
  // tarea en vez de esperar un clic sobre una tarea ya existente.
  const [insertTask, setInsertTask] = useState<{ originTaskId: string; role: "predecessor" | "successor" } | null>(
    null
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Modo "mover en grupo" (punto confirmado con el usuario): el botón
  // "Mover" arma este modo; el siguiente arrastre sobre CUALQUIERA de las
  // barras seleccionadas desplaza a todo el grupo el mismo delta de días
  // hábiles. groupDrag vive acá (no en GanttBar) porque un solo arrastre
  // tiene que mover barras hermanas, algo que una barra sola no puede hacer.
  const [groupMoveArmed, setGroupMoveArmed] = useState(false);
  const [groupDrag, setGroupDrag] = useState<{ dragStartX: number; deltaIndex: number } | null>(null);
  const [criticalSelected, setCriticalSelected] = useState(false);
  const [criticalHoverPos, setCriticalHoverPos] = useState<{ left: number; top: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  // Ctrl/Cmd sostenido es el gesto de selección múltiple (ver toggleSelect):
  // mientras se mantiene presionado para ir marcando varias barras rápido, el
  // tooltip de hover solo estorba tapando las barras vecinas — se apaga acá.
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const closeHoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openHoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const criticalTasksOrderedRef = useRef<GanttTask[]>([]);

  // Punto 2: "Ver mis colisiones" ya filtra `tasks` (server-side, vía
  // matchesBoardFilters) a solo las tareas que chocan entre sí — acá solo
  // falta mover el scroll horizontal a la fecha de inicio MÁS TEMPRANA de
  // ese bloque, mismo mecanismo que scrollToPhaseStart.
  useEffect(() => {
    if (!focusCollision || tasks.length === 0) return;
    const earliestStart = Math.min(...tasks.map((t) => t.startIndex));
    scrollRef.current?.scrollTo({ left: Math.max(0, earliestStart * DAY_WIDTH - DAY_WIDTH), behavior: "smooth" });
    // Solo al entrar en modo colisión (no en cada cambio de `tasks`, que
    // cambia de referencia en cada render del servidor).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCollision]);

  // Botón "Ruta crítica" del filtro (fuera de este componente, ver
  // CriticalPathButton.tsx): mismo efecto que clickear a mano una flecha de
  // la ruta crítica, pero sin tener que encontrarla primero.
  useEffect(() => {
    function onSelectCriticalPath() {
      const first = criticalTasksOrderedRef.current[0];
      if (!first) return;
      setCriticalSelected(true);
      setHighlightedIds(null);
      scrollToBar(first.id);
    }
    window.addEventListener(CRITICAL_PATH_EVENT, onSelectCriticalPath);
    return () => window.removeEventListener(CRITICAL_PATH_EVENT, onSelectCriticalPath);
  }, []);

  // Clic derecho en una barra abre el menú; clic afuera o Escape lo cierra
  // (mismo patrón que ReferencePopover), y Escape también cancela un modo
  // "conectar" ya activo.
  useEffect(() => {
    if (!contextMenu) return;
    function onMouseDown(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) setContextMenu(null);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [contextMenu]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setConnect(null);
      setContextMenu(null);
      setSelectedIds(new Set());
      setGroupMoveArmed(false);
      setGroupDrag(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    function onCtrlDown(e: KeyboardEvent) {
      if (e.key === "Control" || e.key === "Meta") setCtrlHeld(true);
    }
    function onCtrlUp(e: KeyboardEvent) {
      if (e.key === "Control" || e.key === "Meta") setCtrlHeld(false);
    }
    // Si el foco se va de la ventana con Ctrl todavía presionado (alt-tab,
    // devtools, etc.), el keyup nunca llega — sin esto quedaría "pegado" en
    // true y el hover no volvería a mostrarse.
    function onWindowBlur() {
      setCtrlHeld(false);
    }
    document.addEventListener("keydown", onCtrlDown);
    document.addEventListener("keyup", onCtrlUp);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      document.removeEventListener("keydown", onCtrlDown);
      document.removeEventListener("keyup", onCtrlUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, []);

  // Punto confirmado con el usuario: un click SIN Ctrl/Cmd reemplaza la
  // selección (deja solo esta tarea) en vez de sumarse a lo que ya había
  // seleccionado — Ctrl/Cmd sostenido es lo único que agrega/saca de una
  // selección múltiple (para "Poner en paralelo", que necesita 2+).
  function toggleSelect(taskId: string, multi: boolean) {
    // Si la selección resultante baja de 2, "mover en grupo" ya no tiene
    // sentido armado.
    if (!multi) {
      setGroupMoveArmed(false);
      setSelectedIds(selectedIds.size === 1 && selectedIds.has(taskId) ? new Set() : new Set([taskId]));
      return;
    }
    const next = new Set(selectedIds);
    if (next.has(taskId)) next.delete(taskId);
    else next.add(taskId);
    if (next.size < 2) setGroupMoveArmed(false);
    setSelectedIds(next);
  }

  // Clic en la etiqueta de fase (izquierda) → scroll horizontal hasta el día
  // en que arranca esa fase, en vez de dejar que el drag sobre el texto
  // dispare la selección nativa del navegador.
  function scrollToPhaseStart(phaseStart: number) {
    scrollRef.current?.scrollTo({ left: phaseStart * DAY_WIDTH, behavior: "smooth" });
  }

  // Ancla la más temprana del grupo (su fecha no se toca) y liga cada una de
  // las demás a esa ancla con START_TO_START ("en paralelo" del Excel de
  // origen) — mismo setDependency que ya usa el drag-to-connect de una sola
  // barra, solo que aplicado en bloque a toda la selección.
  function applyParallel() {
    const selected = tasks.filter((t) => selectedIds.has(t.id));
    if (selected.length < 2) return;
    const projectId = selected[0].projectId;
    if (selected.some((t) => t.projectId !== projectId)) {
      showToast("Solo se puede poner en paralelo tareas del mismo proyecto.");
      return;
    }
    const anchor = selected.reduce((a, b) => (b.startIndex < a.startIndex ? b : a));
    const others = selected.filter((t) => t.id !== anchor.id);
    startTransition(async () => {
      try {
        for (const t of others) {
          const fd = new FormData();
          fd.set("predecessorId", anchor.id);
          fd.set("type", "START_TO_START");
          await setDependency(t.id, fd);
        }
        setSelectedIds(new Set());
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "No se pudo poner las tareas en paralelo.");
      }
    });
  }

  // Arrastre en grupo: se agarra desde CUALQUIERA de las barras seleccionadas
  // (todas pasan estos mismos tres callbacks cuando groupMoveArmed está
  // activo) — el pointer capture queda en la barra que efectivamente se
  // agarró, así que move/up siguen llegando ahí aunque el puntero salga de
  // esa barra. deltaIndex se aplica por igual a cada barra del grupo vía
  // moveOffsetIndex (ver GanttBar) mientras dura el arrastre.
  function onGroupDragStart(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // idem GanttBar
    }
    setGroupDrag({ dragStartX: e.clientX, deltaIndex: 0 });
  }

  function onGroupDragMove(e: React.PointerEvent) {
    if (!groupDrag) return;
    const deltaIndex = Math.round((e.clientX - groupDrag.dragStartX) / DAY_WIDTH);
    if (deltaIndex !== groupDrag.deltaIndex) setGroupDrag({ ...groupDrag, deltaIndex });
  }

  function onGroupDragEnd(e: React.PointerEvent) {
    if (!groupDrag) return;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // idem GanttBar
    }
    const { deltaIndex } = groupDrag;
    setGroupMoveArmed(false);
    if (deltaIndex === 0) {
      setGroupDrag(null);
      return;
    }
    const taskIds = Array.from(selectedIds);
    // Punto 12: updatedAt de cada tarea del grupo, tal cual la tenía este
    // cliente al armar la selección — ver assertNotStale-equivalente en
    // moveTaskGroup (actions.ts).
    const expectedUpdatedAts = Object.fromEntries(
      taskIds.map((id) => [id, taskById.get(id)?.updatedAt]).filter((entry): entry is [string, string] => Boolean(entry[1]))
    );
    startTransition(async () => {
      try {
        const result = await moveTaskGroup(taskIds, deltaIndex, expectedUpdatedAts);
        setGroupDrag(null);
        if (!result.ok) {
          showToast(result.error ?? "No se pudo mover el grupo.");
          router.refresh();
          return;
        }
        if (result.appliedDelta !== deltaIndex) {
          showToast("Se movió menos de lo arrastrado: una dependencia externa al grupo lo frenó.");
        }
        setSelectedIds(new Set());
        router.refresh();
      } catch (err) {
        setGroupDrag(null);
        showToast(err instanceof Error ? err.message : "No se pudo mover el grupo.");
      }
    });
  }

  // Delay a propósito (no instantáneo): el popup es grande y captura clics
  // (pointer-events-auto, ver más abajo) — si apareciera apenas el mouse
  // toca la flecha, un simple paso de camino a un handle de resize de la
  // barra de al lado quedaba tapado por el popup antes de llegar (bug real,
  // más notorio en tareas cortas como un hito de 1d). Con este delay, un
  // paso rápido nunca llega a abrirlo; solo un hover sostenido lo hace.
  function showCriticalPopup(clientX: number, clientY: number) {
    if (closeHoverTimeoutRef.current) {
      clearTimeout(closeHoverTimeoutRef.current);
      closeHoverTimeoutRef.current = null;
    }
    if (openHoverTimeoutRef.current) clearTimeout(openHoverTimeoutRef.current);
    openHoverTimeoutRef.current = setTimeout(() => {
      const layer = document.getElementById(GANTT_TOOLTIP_LAYER_ID);
      if (!layer) return;
      const rect = layer.getBoundingClientRect();
      // Si no entra debajo del cursor, se dibuja arriba (mismo bug que el
      // tooltip de GanttBar: cerca del fondo del viewport quedaba cortado).
      const fitsBelow = window.innerHeight - clientY >= CRITICAL_POPUP_MAX_HEIGHT + 10;
      const top = fitsBelow ? clientY - rect.top + 10 : clientY - rect.top - CRITICAL_POPUP_MAX_HEIGHT - 10;
      setCriticalHoverPos({ left: clientX - rect.left, top });
    }, 250);
  }

  function scheduleHideCriticalPopup() {
    if (openHoverTimeoutRef.current) {
      clearTimeout(openHoverTimeoutRef.current);
      openHoverTimeoutRef.current = null;
    }
    closeHoverTimeoutRef.current = setTimeout(() => setCriticalHoverPos(null), 150);
  }

  function onContainerContextMenu(e: React.MouseEvent) {
    // Punto 9: `canManage` acá es solo un bail-out barato (¿administra ALGO
    // en absoluto?) — el permiso real que importa es por tarea/vínculo,
    // chequeado abajo con taskById, para que en el panorama general no se
    // pueda tocar una tarea de un proyecto ajeno.
    if (!canManage) return;
    const target = e.target as Element;
    // Un tramo de flecha primero: es más específico que la barra, aunque en
    // la práctica casi no se solapan.
    const edgeGroup = target.closest("path[data-dep-edge]")?.closest("g[data-dependency-id]");
    if (edgeGroup) {
      const dependencyId = edgeGroup.getAttribute("data-dependency-id");
      const successorId = edgeGroup.getAttribute("data-successor-id");
      const predecessorId = edgeGroup.getAttribute("data-predecessor-id");
      if (
        dependencyId &&
        successorId &&
        taskById.get(successorId)?.canManage &&
        (!predecessorId || taskById.get(predecessorId)?.canManage)
      ) {
        e.preventDefault();
        setConnect(null);
        setContextMenu({ kind: "edge", dependencyId, successorId, x: e.clientX, y: e.clientY });
        return;
      }
    }
    const barEl = target.closest('[id^="gantt-bar-"]');
    if (!barEl) return;
    const taskId = barEl.id.replace("gantt-bar-", "");
    if (!taskById.get(taskId)?.canManage) return;
    e.preventDefault();
    setConnect(null);
    setContextMenu({ kind: "task", taskId, x: e.clientX, y: e.clientY });
  }

  function startConnect(originTaskId: string, role: "predecessor" | "successor") {
    const origin = taskById.get(originTaskId);
    setContextMenu(null);
    if (!origin) return;
    const originX = role === "successor" ? (origin.startIndex + origin.span) * DAY_WIDTH : origin.startIndex * DAY_WIDTH;
    const originY = rowCenterY.get(originTaskId)!;
    setConnect({ originTaskId, role, originX, originY, pointerX: originX, pointerY: originY });
  }

  function startInsertTask(originTaskId: string, role: "predecessor" | "successor") {
    setContextMenu(null);
    setInsertTask({ originTaskId, role });
  }

  // Clic derecho en un tramo puntual de flecha → elimina SOLO ese vínculo
  // (a diferencia del clic normal, que selecciona toda la ruta si es crítica).
  function deleteDependency(dependencyId: string, successorId: string) {
    setContextMenu(null);
    startTransition(async () => {
      try {
        await removeDependency(dependencyId, successorId);
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "No se pudo eliminar el vínculo.");
      }
    });
  }

  // Punto confirmado con el usuario: "Eliminar tarea" en el menú contextual
  // del Gantt — solo aparece si task.canManage (ver render más abajo), mismo
  // criterio que ya usa el botón de eliminar del detalle de la tarea.
  async function handleDeleteTaskFromContext(taskId: string, title: string) {
    setContextMenu(null);
    const ok = await confirm(`¿Seguro que querés eliminar la tarea "${title}"? No vas a poder deshacer esto.`, {
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteTask(taskId);
      if (result.ok) router.refresh();
      else showToast(result.error ?? "No se pudo eliminar la tarea.");
    });
  }

  // Clic en cualquier barra mientras el modo "conectar" está activo la toma
  // como destino y crea el vínculo — en captura, para adelantarse a la
  // navegación normal del <a> de la barra (que si no, se dispararía igual).
  function onContainerClickCapture(e: React.MouseEvent) {
    if (!connect) return;
    e.preventDefault();
    e.stopPropagation();
    const barEl = (e.target as Element).closest('[id^="gantt-bar-"]');
    const destinoId = barEl ? barEl.id.replace("gantt-bar-", "") : null;
    setConnect(null);
    if (!destinoId || destinoId === connect.originTaskId) return;
    if (taskById.get(destinoId)?.projectId !== taskById.get(connect.originTaskId)?.projectId) {
      showToast("Solo se puede depender de una tarea del mismo proyecto.");
      return;
    }
    const { originTaskId, role } = connect;
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("type", "FINISH_TO_START");
        if (role === "successor") {
          fd.set("predecessorId", originTaskId);
          await setDependency(destinoId, fd);
        } else {
          fd.set("predecessorId", destinoId);
          await setDependency(originTaskId, fd);
        }
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "No se pudo crear la dependencia.");
      }
    });
  }

  // Espacio vacío del timeline (ni cabecera, ni barra, ni flecha) → cursor de
  // manito y pan con click sostenido, como cualquier app de diagramas.
  function isPannableTarget(target: EventTarget | null) {
    if (!(target instanceof Element)) return false;
    if (target.closest('a, button, [id^="gantt-bar-"], [data-gantt-handle]')) return false;
    return Boolean(target.closest("[data-gantt-timeline]"));
  }

  function onContainerPointerDown(e: React.PointerEvent) {
    if (!(e.target instanceof Element) || !e.target.closest("path[data-dep-edge]")) {
      setHighlightedIds(null);
      setCriticalSelected(false);
    }
    if (reconnect || connect || !isPannableTarget(e.target)) return;
    const el = scrollRef.current;
    if (!el) return;
    // Sin esto, arrastrar sobre texto (títulos, meses) dispara la selección
    // nativa del navegador en vez de solo mover el scroll.
    e.preventDefault();
    panRef.current = { x: e.clientX, y: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
    setIsPanning(true);
    el.setPointerCapture(e.pointerId);
  }

  function onContainerPointerMove(e: React.PointerEvent) {
    if (connect) {
      const svg = svgRef.current;
      if (svg) {
        const rect = svg.getBoundingClientRect();
        setConnect({ ...connect, pointerX: e.clientX - rect.left, pointerY: e.clientY - rect.top });
      }
    }
    const pan = panRef.current;
    const el = scrollRef.current;
    if (!pan || !el) return;
    el.scrollLeft = pan.scrollLeft - (e.clientX - pan.x);
    el.scrollTop = pan.scrollTop - (e.clientY - pan.y);
  }

  function onContainerPointerUp(e: React.PointerEvent) {
    if (!panRef.current) return;
    panRef.current = null;
    setIsPanning(false);
    try {
      scrollRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // idem GanttBar: puntero ya liberado, sin impacto real.
    }
  }

  // Punto 4 confirmado con el usuario: arrastrar el extremo de una flecha ya
  // dibujada la reasigna a otra tarea, en vez de editarla por formulario.
  function onEdgeHandleDown(e: React.PointerEvent, edge: DependencyEdge, movingEnd: "pred" | "succ") {
    e.preventDefault();
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // idem GanttBar
    }
    setReconnect({
      dependencyId: edge.dependencyId,
      predecessorId: edge.predecessorId,
      successorId: edge.successorId,
      type: edge.type,
      movingEnd,
      fixedX: movingEnd === "pred" ? edge.x2 : edge.x1,
      fixedY: movingEnd === "pred" ? edge.y2 : edge.y1,
      pointerX: e.clientX - rect.left,
      pointerY: e.clientY - rect.top,
    });
  }

  function onEdgeHandleMove(e: React.PointerEvent) {
    if (!reconnect) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setReconnect({ ...reconnect, pointerX: e.clientX - rect.left, pointerY: e.clientY - rect.top });
  }

  function onEdgeHandleUp(e: React.PointerEvent) {
    if (!reconnect) return;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // idem GanttBar
    }
    const fixedTaskId = reconnect.movingEnd === "pred" ? reconnect.successorId : reconnect.predecessorId;
    const destinoId = taskIdAtPoint(e.clientX, e.clientY);
    setReconnect(null);
    if (!destinoId || destinoId === fixedTaskId) return;

    // Mismo límite que ya impone el formulario "depende de" de la tarea
    // (solo predecesoras del mismo proyecto) — esta vista también se usa en
    // el dashboard general, donde conviven tareas de varios proyectos.
    if (taskById.get(destinoId)?.projectId !== taskById.get(fixedTaskId)?.projectId) {
      showToast("Solo se puede depender de una tarea del mismo proyecto.");
      return;
    }

    const { dependencyId, predecessorId, successorId, type, movingEnd } = reconnect;
    startTransition(async () => {
      try {
        await removeDependency(dependencyId, successorId);
        const fd = new FormData();
        fd.set("type", type);
        if (movingEnd === "pred") {
          fd.set("predecessorId", destinoId);
          await setDependency(successorId, fd);
        } else {
          fd.set("predecessorId", predecessorId);
          await setDependency(destinoId, fd);
        }
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "No se pudo reasignar la dependencia.");
      }
    });
  }

  // "Hoy" es la fecha calendario en Colombia, no en UTC: pasadas las 7pm hora
  // local, new Date().toISOString() ya cae en el día siguiente en UTC (bug
  // real — hacía que la línea desapareciera de noche, y si ese "día
  // siguiente" era sábado, ni figuraba en businessDays).
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  const todayIndex = closestBusinessDayIndex(businessDays, todayKey);
  const targetEndKey = targetEndDate ? targetEndDate.slice(0, 10) : null;
  const targetEndIndex = targetEndKey ? closestBusinessDayIndex(businessDays, targetEndKey) : -1;
  const businessDaysISO = businessDays.map((d) => d.toISOString());
  const maxEndIndex = businessDays.length - 1;

  const monthGroups: { label: string; count: number }[] = [];
  for (const day of businessDays) {
    const label = monthLabel(day);
    const last = monthGroups[monthGroups.length - 1];
    if (last && last.label === label) last.count += 1;
    else monthGroups.push({ label, count: 1 });
  }

  // Punto 12 confirmado con el usuario: al seleccionar una o varias tareas
  // (mismo Set que ya usan "Poner en paralelo"/"Mover"), se resaltan en el
  // encabezado los números de día que esas tareas ocupan, para ver de un
  // vistazo qué tramo del calendario se está tocando.
  const highlightedDayIndices = new Set<number>();
  if (selectedIds.size > 0) {
    for (const t of tasks) {
      if (!selectedIds.has(t.id)) continue;
      for (let i = t.startIndex; i < t.startIndex + t.span; i++) highlightedDayIndices.add(i);
    }
  }

  const grouped = new Map<string, GanttTask[]>();
  for (const t of orderedTasks) {
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
  const dependencyEdges: DependencyEdge[] = tasks.flatMap((t) =>
    t.dependsOnLinks
      .map((link) => {
        const pred = taskById.get(link.id);
        return pred ? { pred, dependencyId: link.dependencyId, type: link.type } : null;
      })
      .filter((e): e is { pred: GanttTask; dependencyId: string; type: DependencyType } => Boolean(e))
      .map(({ pred, dependencyId, type }) => ({
        // "en paralelo" (START_TO_START) conecta inicio con inicio; el resto
        // (FINISH_TO_START) conecta el fin de la predecesora con el inicio
        // de la sucesora, como cualquier Gantt.
        x1: type === "START_TO_START" ? pred.startIndex * DAY_WIDTH : (pred.startIndex + pred.span) * DAY_WIDTH - 4,
        y1: rowCenterY.get(pred.id)!,
        x2: t.startIndex * DAY_WIDTH,
        y2: rowCenterY.get(t.id)!,
        type,
        dependencyId,
        predecessorId: pred.id,
        successorId: t.id,
      }))
  );

  // Punto 3 confirmado con el usuario: clic en una flecha resalta TODA la
  // cadena de sucesores en cascada (no solo la tarea conectada), usando el
  // mismo grafo de bloqueos que ya alimenta el ícono de cuello de botella.
  const successorsOf = new Map<string, string[]>();
  for (const t of tasks) successorsOf.set(t.id, t.blockedSuccessors.map((s) => s.id));
  function collectDescendants(startId: string) {
    const seen = new Set<string>();
    const queue = [startId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const nextId of successorsOf.get(id) ?? []) queue.push(nextId);
    }
    return seen;
  }

  // Ruta crítica: retrocede desde la tarea que termina más tarde siguiendo,
  // en cada paso, la predecesora "más exigente" (la que realmente empuja esa
  // fecha) — la misma regla que usa requiredStartFor en el servidor, pero
  // sobre las fechas ya planificadas en vez de recalcularlas.
  // ponytail: no valida holgura (LS/LF) contra un forward pass completo —
  // asume que cada tarea ya está en su mínimo posible salvo que alguien la
  // arrastró más tarde a mano. Si se necesita un CPM estricto con holgura
  // visible, ahí se agrega ese cálculo aparte.
  function computeCriticalPath() {
    const criticalTaskIds = new Set<string>();
    const criticalDependencyIds = new Set<string>();
    if (tasks.length === 0) return { criticalTaskIds, criticalDependencyIds };
    const maxEnd = Math.max(...tasks.map((t) => t.startIndex + t.span - 1));
    const queue = tasks.filter((t) => t.startIndex + t.span - 1 === maxEnd);
    while (queue.length > 0) {
      const t = queue.shift()!;
      if (criticalTaskIds.has(t.id)) continue;
      criticalTaskIds.add(t.id);
      let best: { pred: GanttTask; dependencyId: string; value: number } | null = null;
      for (const link of t.dependsOnLinks) {
        const pred = taskById.get(link.id);
        if (!pred) continue;
        const value = link.type === "START_TO_START" ? pred.startIndex : pred.startIndex + pred.span;
        if (!best || value > best.value) best = { pred, dependencyId: link.dependencyId, value };
      }
      if (best) {
        criticalDependencyIds.add(best.dependencyId);
        queue.push(best.pred);
      }
    }
    return { criticalTaskIds, criticalDependencyIds };
  }
  const { criticalTaskIds, criticalDependencyIds } = computeCriticalPath();
  const criticalTasksOrdered = Array.from(criticalTaskIds)
    .map((id) => taskById.get(id)!)
    .sort((a, b) => a.startIndex - b.startIndex);
  useEffect(() => {
    criticalTasksOrderedRef.current = criticalTasksOrdered;
  });

  const tooltipLayer = typeof document !== "undefined" ? document.getElementById(GANTT_TOOLTIP_LAYER_ID) : null;

  return (
    <>
    {/* Alto fijo (mismo patrón que KanbanBoard): el padre (page.tsx) es
        sticky top-[57px] h-[calc(100vh-150px)], así que "h-full" hereda esa
        altura sin importar cuánto contenido haya arriba (breadcrumb, título,
        tabs, filtros) — el Gantt scrollea internamente en ambos ejes dentro
        de ese alto. */}
    <div
      ref={scrollRef}
      onPointerDown={onContainerPointerDown}
      onPointerMove={onContainerPointerMove}
      onPointerUp={onContainerPointerUp}
      onContextMenu={onContainerContextMenu}
      onClickCapture={onContainerClickCapture}
      className={`h-full overflow-x-auto overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-xl border border-slate-200 bg-white mb-0 ${isPanning ? "cursor-grabbing select-none" : connect ? "cursor-crosshair" : ""}`}
    >
      <div style={{ minWidth: LABEL_WIDTH + timelineWidth }}>
        {/* Header: meses — sticky verticalmente (debajo del header fijo del
            programa), siempre visible aunque haya muchas fases/tareas debajo. */}
        <div className="sticky top-0 z-40 flex border-b border-slate-200 bg-white text-xs font-medium text-slate-500">
          <div style={{ width: LABEL_WIDTH }} className="sticky left-0 z-10 flex flex-shrink-0 items-center bg-white px-3 py-2">
            Tarea
          </div>
          <div className="flex flex-col">
            <div className="flex">
              {monthGroups.map((m, i) => (
                <div
                  key={i}
                  style={{ width: m.count * DAY_WIDTH }}
                  className="border-l border-slate-100 py-1 text-center"
                >
                  {m.label}
                </div>
              ))}
            </div>
            <div className="flex border-t border-slate-100">
              {businessDays.map((d, i) => (
                <div
                  key={i}
                  title={weekdayLabel(d)}
                  style={{ width: DAY_WIDTH }}
                  className={`py-1 text-center text-[10px] ${
                    highlightedDayIndices.has(i) ? "bg-indigo-100 font-semibold text-indigo-700" : "font-normal text-slate-400"
                  }`}
                >
                  {dayLabel(d)}
                </div>
              ))}
            </div>
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
                  // ponytail: content-visibility salta el layout/paint de filas
                  // fuera de vista — como ya tienen alto fijo, el navegador no
                  // necesita contain-intrinsic-size para reservar espacio. Es
                  // "carga progresiva" gratis para proyectos con muchas fases.
                  style={{ minWidth: LABEL_WIDTH + timelineWidth, height: PHASE_ROW_HEIGHT, contentVisibility: "auto" }}
                >
                  <div
                    onClick={() => scrollToPhaseStart(phaseStart)}
                    title="Ir al inicio de la fase"
                    className="sticky left-0 z-30 flex flex-shrink-0 cursor-pointer select-none items-center gap-1.5 self-stretch bg-slate-50 px-3 py-1.5"
                    style={{ width: LABEL_WIDTH }}
                  >
                    <ProjectIcon name={first.projectName} iconUrl={first.projectIconUrl} size="h-5 w-5 flex-shrink-0 text-[9px]" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-600" title={first.phaseName}>{first.phaseName}</p>
                      <p className="text-[10px] text-slate-400">{phasePct}% completado</p>
                    </div>
                  </div>
                  <div data-gantt-timeline className="relative flex-1 cursor-grab" style={{ width: timelineWidth, height: PHASE_ROW_HEIGHT }}>
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
                    style={{ height: TASK_ROW_HEIGHT, contentVisibility: "auto" }}
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
                          filteredHref={`${collisionUrlBase}${collisionUrlBase.includes("?") ? "&" : "?"}collision=${t.id}`}
                          filteredLabel="Ver mis colisiones"
                          extraHref={`/collisions/${t.id}`}
                          extraLabel="Ver detalle y alternativas"
                        />
                      )}
                      {t.shareToken && <CopyLinkButton token={t.shareToken} className="flex-shrink-0 text-indigo-500 hover:text-indigo-700" />}
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
                    <div data-gantt-timeline className="relative cursor-grab" style={{ width: timelineWidth, height: TASK_ROW_HEIGHT }}>
                      <GanttBar
                        key={`${t.id}:${t.plannedStart}:${t.plannedEnd}`}
                        taskId={t.id}
                        projectId={t.projectId}
                        status={t.status}
                        title={t.title}
                        color={barColor(t)}
                        startIndex={t.startIndex}
                        span={t.span}
                        minStartIndex={t.minStartIndex}
                        maxEndIndex={maxEndIndex}
                        businessDaysISO={businessDaysISO}
                        plannedStart={t.plannedStart}
                        plannedEnd={t.plannedEnd}
                        updatedAt={t.updatedAt}
                        dependsOn={t.dependsOn}
                        blocks={t.blocks}
                        attachmentsCount={t.attachmentsCount}
                        alert={t.alert}
                        assignees={t.assignees}
                        reviewers={t.reviewers}
                        tags={t.tags}
                        ctrlHeld={ctrlHeld}
                        canResize={t.canManage}
                        highlighted={highlightedIds?.has(t.id)}
                        critical={criticalTaskIds.has(t.id) && !criticalSelected}
                        criticalSelected={criticalTaskIds.has(t.id) && criticalSelected}
                        selected={selectedIds.has(t.id)}
                        onToggleSelect={t.canManage ? (multi) => toggleSelect(t.id, multi) : undefined}
                        groupArmed={groupMoveArmed && selectedIds.has(t.id)}
                        moveOffsetIndex={groupDrag && selectedIds.has(t.id) ? groupDrag.deltaIndex : 0}
                        onGroupDragStart={onGroupDragStart}
                        onGroupDragMove={onGroupDragMove}
                        onGroupDragEnd={onGroupDragEnd}
                      />
                    </div>
                  </div>
                ))}
              </div>
            );
          })}

          {/* Líneas de "hoy" y "cierre del proyecto" a lo alto de todo el
              Gantt (no por fila): así quedan por encima del fondo de los
              encabezados de fase en vez de cortarse en cada uno. */}
          {todayIndex >= 0 && (
            <TodayMarker left={LABEL_WIDTH + todayIndex * DAY_WIDTH + DAY_WIDTH / 2} height={totalRowsHeight} />
          )}
          {targetEndIndex >= 0 && (
            <TodayMarker
              left={LABEL_WIDTH + targetEndIndex * DAY_WIDTH + DAY_WIDTH / 2}
              height={totalRowsHeight}
              colorClass="bg-red-400"
            />
          )}

          {/* Conectores de dependencia — mismo lenguaje visual que cualquier
              Gantt (Smartsheet/MS Project): línea sólida "termina antes de
              que esta empiece", punteada "en paralelo" (mismo inicio). El
              <svg> en sí sigue con pointer-events-none (no le roba el
              drag/click a las barras ni al pan del fondo); cada trazo y cada
              handle de reasignar reactivan pointer-events puntualmente. */}
          <svg
            ref={svgRef}
            className="pointer-events-none absolute top-0 z-0 overflow-visible"
            style={{ left: LABEL_WIDTH, width: timelineWidth, height: totalRowsHeight }}
          >
            <defs>
              <marker id="gantt-dep-arrow" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L8,4 L0,8 Z" fill="#94a3b8" />
              </marker>
              <marker id="gantt-dep-arrow-critical-subtle" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L8,4 L0,8 Z" fill="#475569" />
              </marker>
              <marker id="gantt-dep-arrow-critical" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L8,4 L0,8 Z" fill="#c026d3" />
              </marker>
              <marker id="gantt-dep-arrow-active" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L8,4 L0,8 Z" fill="#6366f1" />
              </marker>
            </defs>
            {dependencyEdges.map((e, i) => {
              const isHighlighted = highlightedIds?.has(e.successorId) ?? false;
              const isCritical = criticalDependencyIds.has(e.dependencyId);
              const isCriticalActive = isCritical && criticalSelected;
              return (
                <g key={i} data-dependency-id={e.dependencyId} data-predecessor-id={e.predecessorId} data-successor-id={e.successorId}>
                  {/* Hit-area invisible más ancha: el trazo real (1.5px) es
                      difícil de clickear a propósito. Sobre un tramo de la
                      ruta crítica, el clic selecciona TODA la ruta (no solo
                      la cascada de esa flecha) y el hover muestra su lista. */}
                  <path
                    d={dependencyPath(e)}
                    data-dep-edge
                    fill="none"
                    stroke="transparent"
                    strokeWidth={10}
                    style={{ pointerEvents: "stroke", cursor: "pointer" }}
                    onClick={() => {
                      if (isCritical) {
                        setCriticalSelected(true);
                        setHighlightedIds(null);
                      } else {
                        setHighlightedIds(collectDescendants(e.successorId));
                        setCriticalSelected(false);
                      }
                    }}
                    onMouseEnter={(ev) => isCritical && showCriticalPopup(ev.clientX, ev.clientY)}
                    onMouseLeave={() => isCritical && scheduleHideCriticalPopup()}
                  />
                  <path
                    d={dependencyPath(e)}
                    fill="none"
                    stroke={isHighlighted ? "#6366f1" : isCriticalActive ? "#c026d3" : isCritical ? "#475569" : "#94a3b8"}
                    strokeWidth={isHighlighted || isCriticalActive ? 2.5 : 1.5}
                    strokeDasharray={e.type === "START_TO_START" ? "3 3" : undefined}
                    markerEnd={
                      isHighlighted
                        ? "url(#gantt-dep-arrow-active)"
                        : isCriticalActive
                          ? "url(#gantt-dep-arrow-critical)"
                          : isCritical
                            ? "url(#gantt-dep-arrow-critical-subtle)"
                            : "url(#gantt-dep-arrow)"
                    }
                    style={{ pointerEvents: "none" }}
                  />
                  {canManage && taskById.get(e.predecessorId)?.canManage && taskById.get(e.successorId)?.canManage && (
                    <>
                      <circle
                        cx={e.x1}
                        cy={e.y1}
                        r={5}
                        data-gantt-handle
                        data-end="pred"
                        fill="white"
                        stroke="#6366f1"
                        strokeWidth={1.5}
                        className="cursor-grab opacity-0 hover:opacity-100"
                        style={{ pointerEvents: "all" }}
                        onPointerDown={(ev) => onEdgeHandleDown(ev, e, "pred")}
                        onPointerMove={onEdgeHandleMove}
                        onPointerUp={onEdgeHandleUp}
                      />
                      <circle
                        cx={e.x2}
                        cy={e.y2}
                        r={5}
                        data-gantt-handle
                        data-end="succ"
                        fill="white"
                        stroke="#6366f1"
                        strokeWidth={1.5}
                        className="cursor-grab opacity-0 hover:opacity-100"
                        style={{ pointerEvents: "all" }}
                        onPointerDown={(ev) => onEdgeHandleDown(ev, e, "succ")}
                        onPointerMove={onEdgeHandleMove}
                        onPointerUp={onEdgeHandleUp}
                      />
                    </>
                  )}
                </g>
              );
            })}
            {reconnect && (
              <line
                x1={reconnect.fixedX}
                y1={reconnect.fixedY}
                x2={reconnect.pointerX}
                y2={reconnect.pointerY}
                stroke="#6366f1"
                strokeWidth={2}
                strokeDasharray="4 4"
              />
            )}
            {connect && (
              <line
                x1={connect.originX}
                y1={connect.originY}
                x2={connect.pointerX}
                y2={connect.pointerY}
                stroke="#6366f1"
                strokeWidth={2}
                strokeDasharray="4 4"
                markerEnd="url(#gantt-dep-arrow-active)"
              />
            )}
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

      {/* Menú contextual (clic derecho): en una barra arranca el modo
          "conectar" (la línea de arriba sigue al puntero hasta hacer clic en
          la tarea destino); en un tramo de flecha, elimina solo ese vínculo. */}
      {contextMenu &&
        tooltipLayer &&
        createPortal(
          <div
            ref={contextMenuRef}
            onClick={(e) => e.stopPropagation()}
            className="pointer-events-auto absolute z-50 w-52 rounded-xl bg-white p-1 text-sm shadow-[0_4px_8px_rgba(15,23,42,0.08),0_16px_40px_rgba(15,23,42,0.12)]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.kind === "task" ? (
              <>
                <button
                  type="button"
                  onClick={() => startConnect(contextMenu.taskId, "predecessor")}
                  className="block w-full rounded-lg px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
                >
                  Vincular predecesor
                </button>
                <button
                  type="button"
                  onClick={() => startConnect(contextMenu.taskId, "successor")}
                  className="block w-full rounded-lg px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
                >
                  Vincular sucesor
                </button>
                <button
                  type="button"
                  onClick={() => startInsertTask(contextMenu.taskId, "predecessor")}
                  className="block w-full rounded-lg px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
                >
                  Crear predecesor
                </button>
                <button
                  type="button"
                  onClick={() => startInsertTask(contextMenu.taskId, "successor")}
                  className="block w-full rounded-lg px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
                >
                  Crear sucesor
                </button>
                {taskById.get(contextMenu.taskId)?.canManage && (
                  <button
                    type="button"
                    onClick={() => handleDeleteTaskFromContext(contextMenu.taskId, taskById.get(contextMenu.taskId)!.title)}
                    className="mt-1 block w-full rounded-lg border-t border-slate-100 px-3 py-2 pt-2.5 text-left text-red-600 hover:bg-red-50"
                  >
                    Eliminar tarea
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => deleteDependency(contextMenu.dependencyId, contextMenu.successorId)}
                className="block w-full rounded-lg px-3 py-2 text-left text-red-600 hover:bg-red-50"
              >
                Eliminar vínculo
              </button>
            )}
          </div>,
          tooltipLayer
        )}

      {/* "Crear predecesor"/"Crear sucesor": mismo ModalShell que usa
          ModalTrigger, pero controlado a mano (ver comentario en
          Modal.tsx) porque se abre desde una opción de menú, no un botón fijo. */}
      {insertTask &&
        (() => {
          const origin = taskById.get(insertTask.originTaskId);
          if (!origin) return null;
          return (
            <ModalShell
              open
              onClose={() => setInsertTask(null)}
              title={insertTask.role === "successor" ? "Crear sucesor" : "Crear predecesor"}
            >
              <InsertAdjacentTaskForm
                projectId={origin.projectId}
                originTaskId={insertTask.originTaskId}
                role={insertTask.role}
                phaseName={origin.phaseName}
                originTitle={origin.title}
                users={users}
                phaseTasks={tasks.filter((t) => t.phaseId === origin.phaseId && t.id !== origin.id)}
                currentPredecessorId={origin.dependsOn[0]}
              />
            </ModalShell>
          );
        })()}

      {/* Popup de hover sobre cualquier tramo de la ruta crítica: lista
          completa de esa ruta, cada tarea cliqueable. onMouseEnter/Leave
          propios hacen de "puente" para que mover el mouse del trazo al
          popup no lo cierre antes de poder hacer clic. */}
      {criticalHoverPos &&
        tooltipLayer &&
        createPortal(
          <div
            onMouseEnter={() => {
              if (closeHoverTimeoutRef.current) {
                clearTimeout(closeHoverTimeoutRef.current);
                closeHoverTimeoutRef.current = null;
              }
            }}
            onMouseLeave={scheduleHideCriticalPopup}
            className="pointer-events-auto absolute z-30 w-60 rounded-xl bg-white p-2 text-xs shadow-[0_4px_8px_rgba(15,23,42,0.08),0_16px_40px_rgba(15,23,42,0.12)]"
            style={{ left: criticalHoverPos.left, top: criticalHoverPos.top }}
          >
            <p className="mb-1 px-2 text-[11px] font-semibold text-slate-500">Ruta crítica</p>
            <ul className="max-h-56 space-y-0.5 overflow-y-auto">
              {criticalTasksOrdered.map((t) => (
                <li key={t.id}>
                  <a
                    href={`/projects/${t.projectId}/tasks/${t.id}`}
                    className="block truncate rounded-lg px-2 py-1 text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                  >
                    {t.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>,
          tooltipLayer
        )}

      {/* Fija en pantalla (mismo criterio que el ToastProvider) en vez de
          seguir a las barras seleccionadas: éstas pueden quedar en filas o
          proyectos distintos, lejos entre sí o fuera de la parte visible del
          panel, así que anclar el botón a un punto fijo es más simple y más
          confiable que perseguir su posición mientras se scrollea/panea. */}
      {canManage && selectedIds.size >= 2 && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg">
          {groupMoveArmed ? (
            <span className="pointer-events-none">Arrastrá cualquiera de las {selectedIds.size} tareas seleccionadas para moverlas juntas</span>
          ) : (
            <>
              <span className="pointer-events-none">{selectedIds.size} tareas seleccionadas</span>
              <button
                type="button"
                onClick={applyParallel}
                className="pointer-events-auto rounded-lg bg-indigo-500 px-3 py-1.5 font-medium hover:bg-indigo-400"
              >
                Poner en paralelo
              </button>
              <button
                type="button"
                onClick={() => setGroupMoveArmed(true)}
                className="pointer-events-auto rounded-lg bg-indigo-500 px-3 py-1.5 font-medium hover:bg-indigo-400"
              >
                Mover
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              setSelectedIds(new Set());
              setGroupMoveArmed(false);
            }}
            className="pointer-events-auto rounded-lg px-2 py-1.5 text-slate-300 hover:text-white"
          >
            Cancelar
          </button>
        </div>
      )}
    </>
  );
}
