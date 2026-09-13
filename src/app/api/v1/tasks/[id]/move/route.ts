import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, safeJson } from "@/lib/apiAuth";
import { moveTask } from "@/app/(app)/projects/[id]/actions";

const bodySchema = z.object({ newStartDate: z.string().min(1), expectedUpdatedAt: z.string().optional() });

// Mueve el cuerpo completo de la barra (inicio + fin juntos) — solo tareas
// que todavía no iniciaron. Mismas reglas que arrastrar en el Gantt.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = bodySchema.safeParse(parsedBody.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const result = await moveTask(id, parsed.data.newStartDate, parsed.data.expectedUpdatedAt, auth.actor);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json(result);
}
