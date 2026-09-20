import { z } from "zod";
import { withBody } from "@/lib/apiResult";
import { completeAcceptanceTask } from "@/app/(app)/projects/[id]/tasks/[taskId]/acceptanceActions";

// Completa la tarea de Aceptación una vez que el cliente aceptó la última ronda.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withBody(request, z.object({}).passthrough(), (actor) => completeAcceptanceTask(id, actor));
}
