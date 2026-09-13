import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/apiAuth";
import { revertReviewCheckResult } from "@/app/(app)/projects/[id]/tasks/[taskId]/reviewActions";

// Revierte una calificación a blanco — solo mientras la ronda siga abierta.
export async function POST(request: Request, { params }: { params: Promise<{ id: string; checkId: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { checkId } = await params;
  const result = await revertReviewCheckResult(checkId, auth.actor);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json(result);
}
