import { withAuth } from "@/lib/apiResult";
import { listProjectThreads } from "@/lib/threadsApi";

// Hilos del proyecto: conversación interna y comentarios de la Definición, con preguntas y su estadística.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(request, (actor) => listProjectThreads(id, actor));
}
