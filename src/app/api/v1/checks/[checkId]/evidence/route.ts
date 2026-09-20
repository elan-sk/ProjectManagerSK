import { z } from "zod";
import { withBody } from "@/lib/apiResult";
import { addCheckEvidence, fileRefSchema } from "@/lib/taskDesign";

// Agrega evidencia (archivos o links) a una prueba o característica. Prueba: revisor, o el asignado si quedó «Con errores».
// Aceptación: asignado, PM o administrador, mientras el cliente no la haya calificado.
const schema = z.object({ files: z.array(fileRefSchema).min(1).max(20) });

export async function POST(request: Request, { params }: { params: Promise<{ checkId: string }> }) {
  const { checkId } = await params;
  return withBody(request, schema, (actor, data) => addCheckEvidence(checkId, actor, data.files), 201);
}
