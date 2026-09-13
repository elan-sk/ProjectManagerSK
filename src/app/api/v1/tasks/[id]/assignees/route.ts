import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, safeJson } from "@/lib/apiAuth";
import { setTaskAssignees } from "@/app/(app)/projects/[id]/tasks/[taskId]/actions";

const bodySchema = z.object({ assigneeIds: z.array(z.string()).min(1) });

// Reusa la MISMA función que la app web (setTaskAssignees) — incluida su
// regla de que un asignado no puede ser también revisor de la misma tarea.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = bodySchema.safeParse(parsedBody.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const formData = new FormData();
  for (const userId of parsed.data.assigneeIds) formData.append("assigneeIds", userId);

  const result = await setTaskAssignees(id, formData, auth.actor);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json(result);
}
