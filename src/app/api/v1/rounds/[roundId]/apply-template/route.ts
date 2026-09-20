import { z } from "zod";
import { withBody } from "@/lib/apiResult";
import { applyTemplateToRound } from "@/lib/taskDesign";

// Copia una plantilla de pruebas a la ronda (idempotente). Solo tareas de tipo Prueba; requiere ser revisor, PM o administrador.
const schema = z.object({ templateId: z.string().min(1) });

export async function POST(request: Request, { params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  return withBody(request, schema, (actor, data) => applyTemplateToRound(roundId, actor, data.templateId), 201);
}
