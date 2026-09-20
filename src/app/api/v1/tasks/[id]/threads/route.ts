import { withAuth } from "@/lib/apiResult";
import { listTaskThreads } from "@/lib/threadsApi";

// Todos los hilos de una tarea, agrupados por lugar: comentarios generales (los que ve el cliente), hilo de cada cambio de un Ajuste,
// de cada característica de una Aceptación, de cada prueba, de cada ronda y la conversación interna. Incluye preguntas con su estadística.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(request, (actor) => listTaskThreads(id, actor));
}
