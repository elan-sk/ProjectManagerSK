import { withAuth } from "@/lib/apiResult";
import { removeCheckEvidence } from "@/lib/taskDesign";

// Quita una evidencia de una prueba o característica. Prueba: revisor, o el asignado si quedó «Con errores».
// Aceptación: asignado, PM o administrador.
export async function DELETE(request: Request, { params }: { params: Promise<{ evidenceId: string }> }) {
  const { evidenceId } = await params;
  return withAuth(request, (actor) => removeCheckEvidence(evidenceId, actor));
}
