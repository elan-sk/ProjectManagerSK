import { prisma } from "@/lib/prisma";
import type { TaskStatus, TaskType } from "@prisma/client";

// Cliente de una transacción de ESTE prisma (con sus `omit`), o el propio prisma fuera de una.
type Db = Pick<typeof prisma, "task">;

// Una tarea «Sin iniciar» pasa sola a «En curso» apenas alguien hace su primer trabajo real en ella —
// nadie tiene que acordarse de moverla a mano. Qué cuenta como arrancar depende del tipo:
//   - Entregable: subir un «Resultado».
//   - Ajuste: cargar el «Después» de un cambio (la misma señal que lo da por respondido).
//   - Prueba y Aceptación: enviar la ronda a revisión.
//   - Cualquier tarea con checklist: chulear un paso.
// Solo mueve desde «Sin iniciar»: nunca saca una tarea de Bloqueada, Devuelta o Completada.
export type StartSignal = "RESULTADO" | "ADJUSTMENT_AFTER" | "ROUND_SUBMITTED" | "STEP_DONE";

const SIGNAL_TYPES: Record<StartSignal, TaskType[] | "any"> = {
  RESULTADO: ["MILESTONE", "QA"],
  ADJUSTMENT_AFTER: ["ADJUSTMENT"],
  ROUND_SUBMITTED: ["QA", "ACCEPTANCE"],
  STEP_DONE: "any",
};

/** Regla pura (sin base de datos), para poder probarla: ¿esta señal arranca esta tarea? */
export function shouldAutoStart(task: { status: TaskStatus; type: TaskType; stepsCount: number }, signal: StartSignal) {
  if (task.status !== "NOT_STARTED") return false;
  const types = SIGNAL_TYPES[signal];
  if (types === "any") return true;
  // Un resultado también arranca cualquier tarea con checklist (comportamiento que ya existía).
  return types.includes(task.type) || (signal === "RESULTADO" && task.stepsCount > 0);
}

/** Pasa la tarea a «En curso» (y registra su inicio real) si la señal corresponde. Devuelve si la movió. */
export async function autoStartTask(taskId: string, signal: StartSignal, db: Db = prisma) {
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: { status: true, type: true, actualStart: true, _count: { select: { steps: true } } },
  });
  if (!task || !shouldAutoStart({ status: task.status, type: task.type, stepsCount: task._count.steps }, signal)) return false;
  // updateMany con el estado en el filtro: si otra acción la movió en paralelo, no se pisa.
  const { count } = await db.task.updateMany({
    where: { id: taskId, status: "NOT_STARTED" },
    data: { status: "IN_PROGRESS", actualStart: task.actualStart ?? new Date() },
  });
  return count > 0;
}
