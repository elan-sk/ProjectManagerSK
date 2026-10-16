import { withAuth } from "@/lib/apiResult";
import { prisma } from "@/lib/prisma";

// Respuestas guardadas para las pruebas «Con errores», por categoría (Configuración → Pruebas). Las lee cualquiera
// con sesión: son las mismas que la app le sugiere al asignado. Reutilizar una antes de escribir otra; la nueva
// se guarda sola al responder (PUT /checks/:checkId/response). Para una prueba puntual, `suggestedResponses` en
// GET /tasks/:id/design ya trae solo las de su categoría.
export async function GET(request: Request) {
  return withAuth(request, async () => {
    const categories = await prisma.responseCategory.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, responses: { orderBy: { text: "asc" }, select: { id: true, text: true } } },
    });
    return { ok: true, categories };
  });
}
