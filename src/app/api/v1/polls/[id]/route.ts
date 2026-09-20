import { z } from "zod";
import { withAuth, withBody } from "@/lib/apiResult";
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
