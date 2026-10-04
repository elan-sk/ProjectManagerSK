import { z } from "zod";
import { runAction, withBody } from "@/lib/apiResult";
import { reorderPhases } from "@/app/(app)/projects/[id]/taskOps";

// Reordena las fases: { phaseIds } con TODAS las fases del proyecto, en el orden nuevo. Solo PM o administrador.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withBody(request, z.object({ phaseIds: z.array(z.string()).min(1) }), (actor, data) => runAction(() => reorderPhases(id, data.phaseIds, actor)));
}
