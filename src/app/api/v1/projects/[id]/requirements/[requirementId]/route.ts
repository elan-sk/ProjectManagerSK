import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, safeJson } from "@/lib/apiAuth";
import { updateRequirement, deleteRequirement } from "@/app/(app)/projects/[id]/definitionActions";

const bodySchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  objectiveIds: z.array(z.string()).default([]),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; requirementId: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { requirementId } = await params;
  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = bodySchema.safeParse(parsedBody.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const formData = new FormData();
  formData.set("title", parsed.data.title);
  if (parsed.data.description) formData.set("description", parsed.data.description);
  for (const id of parsed.data.objectiveIds) formData.append("objectiveIds", id);

  const result = await updateRequirement(requirementId, formData, auth.actor);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json(result);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; requirementId: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { requirementId } = await params;
  const result = await deleteRequirement(requirementId, auth.actor);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json(result);
}
