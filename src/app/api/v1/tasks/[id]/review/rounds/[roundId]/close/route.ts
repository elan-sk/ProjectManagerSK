import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/apiAuth";
import { closeReviewRound } from "@/app/(app)/projects/[id]/tasks/[taskId]/reviewActions";

// Exige que TODOS los checks tengan resultado. Si alguno quedó "Con
// errores" -> la tarea pasa a "Devuelta"; si no, queda lista para completar.
export async function POST(request: Request, { params }: { params: Promise<{ id: string; roundId: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { roundId } = await params;
  const result = await closeReviewRound(roundId, auth.actor);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json(result);
}
