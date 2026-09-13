import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/apiAuth";
import { completeReviewTask } from "@/app/(app)/projects/[id]/tasks/[taskId]/reviewActions";

// Solo el revisor, el PM del proyecto o un administrador — y solo con la
// última ronda aprobada.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const result = await completeReviewTask(id, auth.actor);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json(result);
}
