import { withAuth } from "@/lib/apiResult";
import { removeRoundDeliverable } from "@/lib/taskDesign";

// Quita un entregable de una ronda abierta (Prueba o Aceptación). Asignado, PM o administrador.
export async function DELETE(request: Request, { params }: { params: Promise<{ deliverableId: string }> }) {
  const { deliverableId } = await params;
  return withAuth(request, (actor) => removeRoundDeliverable(deliverableId, actor));
}
