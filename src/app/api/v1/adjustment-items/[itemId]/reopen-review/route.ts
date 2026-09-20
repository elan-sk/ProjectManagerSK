import { z } from "zod";
import { withBody } from "@/lib/apiResult";
import { reopenAdjustmentReview } from "@/app/(app)/projects/[id]/tasks/[taskId]/shareThreadActions";

// Vuelve a abrir un cambio para que el cliente lo califique otra vez desde su link (cuando pidió cambios y ya se corrigieron).
export async function POST(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  return withBody(request, z.object({}).passthrough(), (actor) => reopenAdjustmentReview(itemId, actor));
}
