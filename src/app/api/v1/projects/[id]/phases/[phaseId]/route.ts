import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, safeJson } from "@/lib/apiAuth";
import { updatePhase, deletePhase } from "@/app/(app)/projects/[id]/definitionActions";

const bodySchema = z.object({ name: z.string().min(1), requirementIds: z.array(z.string()).default([]) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; phaseId: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { phaseId } = await params;
  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = bodySchema.safeParse(parsedBody.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const formData = new FormData();
  formData.set("name", parsed.data.name);
  for (const id of parsed.data.requirementIds) formData.append("requirementIds", id);

  const result = await updatePhase(phaseId, formData, auth.actor);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json(result);
}

// No se puede borrar una fase con tareas asignadas — mismo mensaje claro que
// la app web (movelas o eliminalas primero).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; phaseId: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { phaseId } = await params;
  const result = await deletePhase(phaseId, auth.actor);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json(result);
}
