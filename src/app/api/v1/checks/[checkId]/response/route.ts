import { z } from "zod";
import { withBody } from "@/lib/apiResult";
import { setCheckResponse } from "@/lib/taskDesign";

// Respuesta a una prueba que quedó «Con errores» (asignado, PM o administrador). Con su evidencia
// (POST /checks/:checkId/evidence) en todas las pruebas con error, se puede reenviar a revisión.
const schema = z.object({ response: z.string().max(500) });

export async function PUT(request: Request, { params }: { params: Promise<{ checkId: string }> }) {
  const { checkId } = await params;
  return withBody(request, schema, (actor, data) => setCheckResponse(checkId, actor, data.response));
}
