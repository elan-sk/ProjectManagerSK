import { z } from "zod";
import { withBody } from "@/lib/apiResult";
import { addRoundDeliverables, fileRefSchema } from "@/lib/taskDesign";

// Agrega entregables (archivos o links) a una ronda abierta. Requiere ser asignado, PM o administrador.
const schema = z.object({ files: z.array(fileRefSchema).min(1).max(20) });

export async function POST(request: Request, { params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  return withBody(request, schema, (actor, data) => addRoundDeliverables(roundId, actor, data.files), 201);
}
