import { z } from "zod";
import { runAction, withAuth, withBody } from "@/lib/apiResult";
import { deleteInternalMessage, editInternalMessage } from "@/app/(app)/internalMessageActions";

// Mensajes de la conversación interna (scope "conversation" / "qa_check" / conversación del proyecto).
// PATCH { body }: solo su autor, dentro de la ventana de edición. DELETE: el autor en esa ventana, o PM/administrador siempre.
type Params = { params: Promise<{ messageId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { messageId } = await params;
  return withBody(request, z.object({ body: z.string().min(1) }), (actor, data) => runAction(() => editInternalMessage(messageId, data.body, actor)));
}

export async function DELETE(request: Request, { params }: Params) {
  const { messageId } = await params;
  return withAuth(request, (actor) => runAction(() => deleteInternalMessage(messageId, actor)));
}
