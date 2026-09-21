import { z } from "zod";
import { withAuth, withBody } from "@/lib/apiResult";
import { removeCheck, updateCheck } from "@/lib/taskDesign";

// Reescribe el título, los criterios o la categoría de una prueba o característica
// que todavía no tiene resultado, en una ronda abierta (conserva capturas y comentarios).
const schema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  criteria: z.string().trim().max(4000).nullable().optional(),
  category: z.string().trim().max(120).nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ checkId: string }> }) {
  const { checkId } = await params;
  return withBody(request, schema, (actor, data) => updateCheck(checkId, actor, data));
}

// Quita una prueba o característica que todavía no tiene resultado, en una ronda abierta.
export async function DELETE(request: Request, { params }: { params: Promise<{ checkId: string }> }) {
  const { checkId } = await params;
  return withAuth(request, (actor) => removeCheck(checkId, actor));
}
