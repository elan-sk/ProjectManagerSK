import { z } from "zod";
import { withBody } from "@/lib/apiResult";
import { votePoll } from "@/lib/threadsApi";

// Responde una pregunta con la persona que inició sesión: { optionIds: [id] } (una sola opción si es de selección única).
// Reemplaza la respuesta anterior de esa persona. Responde quien tiene permisos sobre la tarea (o participa en el proyecto).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withBody(request, z.object({ optionIds: z.array(z.string()).min(1).max(10) }), (actor, data) => votePoll(id, data.optionIds, actor));
}
