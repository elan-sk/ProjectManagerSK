import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, safeJson } from "@/lib/apiAuth";
import { resizeTask } from "@/app/(app)/projects/[id]/actions";

const bodySchema = z.object({
  edge: z.enum(["start", "end"]),
  newDate: z.string().min(1),
  expectedUpdatedAt: z.string().optional(),
});

// Mueve un solo extremo de la barra (cambia la duración). Mismas reglas que
// arrastrar el handle en el Gantt: inicio solo si no arrancó, fin solo si no
// está completada, y respeta la fecha mínima según sus predecesoras.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = bodySchema.safeParse(parsedBody.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const result = await resizeTask(id, parsed.data.edge, parsed.data.newDate, parsed.data.expectedUpdatedAt, auth.actor);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json(result);
}
