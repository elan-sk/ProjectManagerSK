import { z } from "zod";
import { runAction, withAuth, withBody } from "@/lib/apiResult";
import { deleteTag, updateTag } from "@/app/(app)/settings/tags/tagActions";

// Renombra una etiqueta: { name }. PM del proyecto o administrador; el cambio se ve en todas sus tareas.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withBody(request, z.object({ name: z.string() }), (actor, data) => runAction(() => updateTag(id, data.name, actor)));
}

// Elimina la etiqueta de su proyecto (se quita de sus tareas; las tareas quedan). Solo administrador.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(request, (actor) => runAction(() => deleteTag(id, actor)));
}
