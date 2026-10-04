import { runAction, withBody } from "@/lib/apiResult";
import { pollInputSchema } from "@/lib/threadsApi";
import { addStepPoll } from "@/app/(app)/projects/[id]/tasks/[taskId]/shareThreadActions";

// Convierte un paso del checklist en pregunta de selección: { multiple, options } (el enunciado es el texto del paso).
// Se vota/cierra/lee con /api/v1/polls/:id; se quita con DELETE /api/v1/polls/:id.
export async function POST(request: Request, { params }: { params: Promise<{ stepId: string }> }) {
  const { stepId } = await params;
  return withBody(request, pollInputSchema, (actor, data) => runAction(() => addStepPoll(stepId, data, actor)), 201);
}
