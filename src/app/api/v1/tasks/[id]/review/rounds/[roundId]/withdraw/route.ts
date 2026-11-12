import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/apiAuth";
import { withdrawReviewRound } from "@/app/(app)/projects/[id]/tasks/[taskId]/reviewActions";

// Retira el envío de la ronda 1 mientras ninguna prueba tenga resultado.
export async function POST(request: Request, { params }: { params: Promise<{ id: string; roundId: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { roundId } = await params;
  const result = await withdrawReviewRound(roundId, auth.actor);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json(result);
}
