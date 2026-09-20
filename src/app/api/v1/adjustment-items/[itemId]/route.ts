import { z } from "zod";
import { withAuth, withBody } from "@/lib/apiResult";
import { deleteAdjustmentItem, updateAdjustmentItem } from "@/lib/taskDesign";

// Edita la descripción o la nota de un cambio de un Ajuste. Requiere ser asignado, PM o administrador.
const schema = z.object({ description: z.string().trim().min(1).max(1000).optional(), note: z.string().trim().max(2000).nullable().optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  return withBody(request, schema, (actor, data) => updateAdjustmentItem(itemId, actor, data));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  return withAuth(request, (actor) => deleteAdjustmentItem(itemId, actor));
}
