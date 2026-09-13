import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, safeJson } from "@/lib/apiAuth";
import { toggleStep } from "@/app/(app)/projects/[id]/tasks/[taskId]/actions";

const bodySchema = z.object({ done: z.boolean() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; stepId: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { stepId } = await params;
  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = bodySchema.safeParse(parsedBody.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    await toggleStep(stepId, parsed.data.done, auth.actor);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
