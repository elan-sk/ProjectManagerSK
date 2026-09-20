import { withAuth } from "@/lib/apiResult";
import { removeCheck } from "@/lib/taskDesign";

// Quita una prueba o característica que todavía no tiene resultado, en una ronda abierta.
export async function DELETE(request: Request, { params }: { params: Promise<{ checkId: string }> }) {
  const { checkId } = await params;
  return withAuth(request, (actor) => removeCheck(checkId, actor));
}
