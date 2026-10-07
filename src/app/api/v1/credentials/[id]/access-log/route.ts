import { withAuth } from "@/lib/apiResult";
import { canSeeCredential } from "@/lib/credentials";
import { getCredentialAccessLog } from "@/app/(app)/credentials/actions";

// Historial de acceso de una contraseña (quién la abrió, mostró o copió y cuándo; "source": app o api).
// Solo quien la creó, el PM o un administrador.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(request, async (actor) => {
    if (!(await canSeeCredential(id, actor))) return { ok: false, status: 404, error: "No existe." };
    return getCredentialAccessLog(id, actor);
  });
}
