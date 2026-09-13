import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, safeJson } from "@/lib/apiAuth";
import { setReviewCheckResult } from "@/app/(app)/projects/[id]/tasks/[taskId]/reviewActions";

const bodySchema = z.object({
  result: z.enum(["APPROVED", "FLAGGED", "FAILED", "NOT_APPLICABLE"]),
  note: z.string().default(""),
});

// Calificar con "Con errores"/"Con hallazgos" exige que la prueba ya tenga
// evidencia cargada (mismo chequeo que la app web).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; checkId: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { checkId } = await params;
  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = bodySchema.safeParse(parsedBody.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const result = await setReviewCheckResult(checkId, parsed.data.result, parsed.data.note, auth.actor);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json(result);
}
