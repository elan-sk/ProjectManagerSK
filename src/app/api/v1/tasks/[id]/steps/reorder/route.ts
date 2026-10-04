import { z } from "zod";
import { runAction, withBody } from "@/lib/apiResult";
import { reorderSteps } from "@/app/(app)/projects/[id]/tasks/[taskId]/actions";

// Reordena el checklist: { stepIds } con todos los pasos de la tarea en el orden nuevo.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withBody(request, z.object({ stepIds: z.array(z.string()).min(1) }), (actor, data) => runAction(() => reorderSteps(id, data.stepIds, actor)));
}
