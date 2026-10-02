import { withAuth, withBody } from "@/lib/apiResult";
import { fileRefSchema, updateTaskAttachment } from "@/lib/taskDesign";

// Un Insumo/Evidencia de la tarea. PUT: { url, name, mimeType? } (lo devuelto por /api/upload) lo reemplaza
// en su mismo lugar. DELETE: lo quita. Solo quien lo subió; una tarea completada no admite cambios.
type Params = { params: Promise<{ id: string; attachmentId: string }> };

export async function PUT(request: Request, { params }: Params) {
  const { id, attachmentId } = await params;
  return withBody(request, fileRefSchema, (actor, file) => updateTaskAttachment(id, attachmentId, actor, file));
}

export async function DELETE(request: Request, { params }: Params) {
  const { id, attachmentId } = await params;
  return withAuth(request, (actor) => updateTaskAttachment(id, attachmentId, actor, null));
}
