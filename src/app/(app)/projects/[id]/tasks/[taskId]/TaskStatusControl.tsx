"use client";

import { useState, useTransition } from "react";
import { updateTaskStatus } from "../../actions";
import { useConfirm } from "@/components/Confirm";
import { TASK_STATUS_LABEL, TASK_STATUS_COLOR } from "@/lib/statusColors";
import type { TaskStatus, TaskType } from "@prisma/client";

// Orden fijo de la fila de botones: "Completada" siempre al final, y
// "Devuelta" (solo la usa el revisor en tareas de tipo Prueba/QA) va antes,
// entre "Bloqueada" y "Completada" — nunca al final ni en tareas de otro tipo.
const ORDER: TaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "RETURNED", "COMPLETED"];

// Punto 5: espeja EXACTAMENTE las mismas reglas de permiso que ya valida
// updateTaskStatus del lado servidor (actions.ts) — así el botón nace
// deshabilitado para quien no puede tocarlo, en vez de aceptar el clic y
// recién ahí rechazarlo (el "brinco" reportado). Las reglas de negocio que
// dependen de DATOS (checklist, evidencia, ronda aprobada) llegan ya
// resueltas en `completionBlockedReason` — no hace falta duplicar esas
// consultas acá.
function getDisabledReason(
  target: TaskStatus,
  current: TaskStatus,
  ctx: { type: TaskType; canEdit: boolean; canReview: boolean; canManage: boolean; completionBlockedReason: string | null }
): string | null {
  if (target === current) return null;

  const baseCanChange = target === "COMPLETED" && ctx.type === "QA" ? ctx.canReview : ctx.canEdit;
  if (!baseCanChange) {
    return ctx.type === "QA" && target === "COMPLETED"
      ? "Solo el revisor, el PM del proyecto o un administrador pueden completar esta prueba."
      : "Solo un asignado a esta tarea, el PM del proyecto o un administrador pueden cambiar su estado.";
  }

  if (ctx.type === "QA" && current === "RETURNED") {
    return "Esta tarea está devuelta por revisión — reenviá una ronda para salir de este estado.";
  }
  if (ctx.type === "ACCEPTANCE" && current === "RETURNED") {
    return "El cliente devolvió esta entrega — reenviá una ronda para salir de este estado.";
  }

  if (!ctx.canManage) {
    if (current === "COMPLETED" && target !== "COMPLETED") {
      return "Solo el PM del proyecto o un administrador pueden cambiar el estado de una tarea completada.";
    }
    if (target === "NOT_STARTED" && (current === "IN_PROGRESS" || current === "BLOCKED")) {
      return "Solo el PM del proyecto o un administrador pueden devolver una tarea a \"Sin iniciar\".";
    }
  }

  if (target === "COMPLETED" && ctx.completionBlockedReason) return ctx.completionBlockedReason;

  return null;
}

export function TaskStatusControl({
  taskId,
  status,
  type,
  canEdit,
  canReview,
  canManage,
  completionBlockedReason,
}: {
  taskId: string;
  status: TaskStatus;
  type: TaskType;
  canEdit: boolean;
  canReview: boolean;
  canManage: boolean;
  completionBlockedReason: string | null;
}) {
  const confirm = useConfirm();
  const [current, setCurrent] = useState(status);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Punto 17: "Devuelta" es la única que nunca se puede elegir a mano (ni
  // PM/admin) — solo la pone/saca el propio flujo de rondas.
  const options = ORDER.filter((value) => value !== "RETURNED");

  async function change(next: TaskStatus) {
    if (next === current) return;
    if (next === "COMPLETED") {
      const ok = await confirm(
        "Una vez que la marques como completada, no vas a poder subir más evidencia para esta tarea. ¿Querés continuar?",
        { confirmLabel: "Sí, completar" }
      );
      if (!ok) return;
    }
    setError(null);
    const previous = current;
    setCurrent(next);
    startTransition(async () => {
      const result = await updateTaskStatus(taskId, next);
      if (!result.ok) {
        setCurrent(previous);
        setError(result.error ?? "No se pudo cambiar el estado.");
      }
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Punto 17: "Devuelta" no es un botón clickeable (no se puede elegir
            a mano) pero mientras la tarea está en ese estado sigue habiendo
            que mostrarlo — si no, la fila de botones no resalta nada. */}
        {(type === "QA" || type === "ACCEPTANCE") && status === "RETURNED" && (
          <span className={`rounded-lg px-3 py-1.5 text-sm font-medium text-white ${TASK_STATUS_COLOR.RETURNED.solid}`}>
            {TASK_STATUS_LABEL.RETURNED}
          </span>
        )}
        {options.map((value) => {
          const disabledReason = getDisabledReason(value, current, { type, canEdit, canReview, canManage, completionBlockedReason });
          return (
            <button
              key={value}
              type="button"
              disabled={isPending || Boolean(disabledReason)}
              title={disabledReason ?? undefined}
              onClick={() => change(value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
                current === value ? `${TASK_STATUS_COLOR[value].solid} text-white` : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {TASK_STATUS_LABEL[value]}
            </button>
          );
        })}
      </div>
      {/* Punto 7: en su propio bloque (fuera de la fila de botones) para que
          no empuje/desalinee los botones vecinos (Compartir, Eliminar) que
          comparten la misma fila flex en la página de la tarea. */}
      {error && <p className="mt-1 w-full text-xs text-red-600">{error}</p>}
    </>
  );
}
