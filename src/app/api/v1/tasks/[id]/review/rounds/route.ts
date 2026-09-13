import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, safeJson } from "@/lib/apiAuth";
import { submitReviewRound } from "@/app/(app)/projects/[id]/tasks/[taskId]/reviewActions";

const bodySchema = z.object({
  deliverables: z
    .array(
      z.object({
        // `id` de un entregable de la ronda anterior — lo reasigna en vez de
        // duplicarlo (ver reviewActions.ts). Omitilo para un ítem nuevo.
        id: z.string().optional(),
        name: z.string().min(1),
        url: z.string().min(1),
        mimeType: z.string().min(1),
      })
    )
    .min(1),
});

// Envía (ronda 1) o reenvía (ronda 2+, tras una devolución) — para tipo
// Prueba/QA. Mismas reglas que la app web: al reenviar, exige que todas las
// pruebas "Con errores" ya tengan respuesta + evidencia de corrección.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = bodySchema.safeParse(parsedBody.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const result = await submitReviewRound(id, parsed.data.deliverables, auth.actor);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json(result, { status: 201 });
}
