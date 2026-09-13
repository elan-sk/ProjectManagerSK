import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, safeJson } from "@/lib/apiAuth";
import { moveTaskGroup } from "@/app/(app)/projects/[id]/actions";

const bodySchema = z.object({
  taskIds: z.array(z.string()).min(1),
  deltaDays: z.number().int(),
  expectedUpdatedAts: z.record(z.string(), z.string()).optional(),
});

// Mueve varias tareas seleccionadas el mismo delta de días hábiles — si
// alguna tiene una predecesora fuera del grupo, el delta se recorta solo
// (nunca se rechaza todo el movimiento).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  await params; // solo para mantener la forma de ruta /projects/[id]/...
  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = bodySchema.safeParse(parsedBody.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const result = await moveTaskGroup(parsed.data.taskIds, parsed.data.deltaDays, parsed.data.expectedUpdatedAts, auth.actor);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json(result);
}
