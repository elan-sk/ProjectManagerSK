import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, safeJson } from "@/lib/apiAuth";
import { removeStep, toggleStep, updateStep } from "@/app/(app)/projects/[id]/tasks/[taskId]/actions";

// PATCH: { done?, description? } (al menos uno) — marca el paso y/o cambia su texto. DELETE: quita el paso.
const bodySchema = z
  .object({ done: z.boolean().optional(), description: z.string().optional() })
  .refine((b) => b.done !== undefined || b.description !== undefined, "Indique done o description.");

type Params = { params: Promise<{ id: string; stepId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { stepId } = await params;
  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = bodySchema.safeParse(parsedBody.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    if (parsed.data.description !== undefined) await updateStep(stepId, parsed.data.description, auth.actor);
    if (parsed.data.done !== undefined) await toggleStep(stepId, parsed.data.done, auth.actor);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { stepId } = await params;
  try {
    await removeStep(stepId, auth.actor);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
