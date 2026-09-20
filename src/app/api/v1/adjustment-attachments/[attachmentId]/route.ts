import { withAuth } from "@/lib/apiResult";
import { removeAdjustmentAttachment } from "@/lib/taskDesign";

// Quita un adjunto de un cambio. Solo PM del proyecto o administrador (igual que en la app).
export async function DELETE(request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  const { attachmentId } = await params;
  return withAuth(request, (actor) => removeAdjustmentAttachment(attachmentId, actor));
}
