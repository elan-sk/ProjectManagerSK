import { runAction, withAuth } from "@/lib/apiResult";
import { removeProjectLink } from "@/app/(app)/projects/[id]/definitionActions";

// Quita un link de la Definición del proyecto. Solo PM del proyecto o administrador.
export async function DELETE(request: Request, { params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = await params;
  return withAuth(request, (actor) => runAction(() => removeProjectLink(linkId, actor)));
}
