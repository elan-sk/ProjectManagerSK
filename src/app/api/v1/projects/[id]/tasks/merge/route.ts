import { z } from "zod";
import { runAction, withBody } from "@/lib/apiResult";
import { mergeTasks } from "@/app/(app)/projects/[id]/taskOps";

// Combina varias tareas del proyecto en una: { taskIds (2 o más), title }. Devuelve { id } de la tarea resultante.
// Mismas reglas que la app (solo PM o administrador).
export async function POST(request: Request) {
  return withBody(request, z.object({ taskIds: z.array(z.string()).min(2), title: z.string().trim().min(1) }), (actor, data) => runAction(() => mergeTasks(data.taskIds, data.title, actor)), 201);
}
