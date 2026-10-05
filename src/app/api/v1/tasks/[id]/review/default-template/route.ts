import { z } from "zod";
import { withBody } from "@/lib/apiResult";
import { setDefaultTestTemplate } from "@/lib/taskDesign";

// Elige (o quita, con null) la plantilla que se copia sola a la ronda 1 de una Prueba. Revisor, PM o administrador.
const schema = z.object({ templateId: z.string().min(1).nullable() });

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withBody(request, schema, (actor, data) => setDefaultTestTemplate(id, actor, data.templateId));
}
