import { z } from "zod";
import { runAction, withBody } from "@/lib/apiResult";
import { duplicateTask } from "@/app/(app)/projects/[id]/taskOps";

// Duplica la tarea (datos, asignados, revisores, checklist sin marcar, etiquetas e insumos). Devuelve { id } de la copia.
// Solo PM del proyecto o administrador.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withBody(request, z.object({}).passthrough(), (actor) => runAction(() => duplicateTask(id, actor)), 201);
}
