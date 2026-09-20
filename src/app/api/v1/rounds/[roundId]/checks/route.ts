import { z } from "zod";
import { withBody } from "@/lib/apiResult";
import { addChecksToRound, checkSchema } from "@/lib/taskDesign";

// Agrega pruebas (tarea Prueba) o características (tarea Aceptación) a la primera ronda, mientras siga abierta.
// Pruebas: revisor, PM o administrador. Aceptación: asignado, PM o administrador.
const schema = z.object({ checks: z.array(checkSchema).min(1).max(200) });

export async function POST(request: Request, { params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  return withBody(request, schema, (actor, data) => addChecksToRound(roundId, actor, data.checks), 201);
}
