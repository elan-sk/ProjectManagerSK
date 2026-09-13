import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, safeJson } from "@/lib/apiAuth";
import { setTaskReviewers } from "@/app/(app)/projects/[id]/tasks/[taskId]/reviewActions";

const bodySchema = z.object({ reviewerIds: z.array(z.string()).default([]) });

// Reusa la MISMA función que la app web (setTaskReviewers) — mismas reglas
// (revisor no puede ser también asignado, ronda cerrada bloquea el cambio,
// solo PM/admin/revisor actual puede reasignar una vez que ya hay revisor).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = bodySchema.safeParse(parsedBody.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const formData = new FormData();
  for (const userId of parsed.data.reviewerIds) formData.append("reviewerIds", userId);

  const result = await setTaskReviewers(id, formData, auth.actor);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json(result);
}
