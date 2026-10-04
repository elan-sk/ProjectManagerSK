import { z } from "zod";
import { runAction, withAuth, withBody } from "@/lib/apiResult";
import { removeStepPoll } from "@/app/(app)/projects/[id]/tasks/[taskId]/shareThreadActions";
import { getPoll, setPollClosed } from "@/lib/threadsApi";

// GET: la pregunta con su estadística (cuántas personas eligieron cada opción y quién). PATCH { closed }: la cierra o la reabre
// (quien la publicó, quien edita la tarea, o el PM/administrador del proyecto).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(request, (actor) => getPoll(id, actor));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withBody(request, z.object({ closed: z.boolean() }), (actor, data) => setPollClosed(id, data.closed, actor));
}

// DELETE: quita la pregunta de un paso del checklist (el paso queda como paso común). Quien edita la tarea.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(request, (actor) => runAction(() => removeStepPoll(id, actor)));
}
