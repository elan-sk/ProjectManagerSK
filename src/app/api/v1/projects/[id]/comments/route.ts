import { z } from "zod";
import { withBody } from "@/lib/apiResult";
import { commentInputSchema, postProjectComment, PROJECT_SCOPES } from "@/lib/threadsApi";

// Publica un comentario o una pregunta en el proyecto.
//   scope: "project_conversation" conversación interna del proyecto (menciones e imágenes)
//          "project_definition"   hilo de la Definición (el que ve el cliente por el link del proyecto; sin adjuntos)
// Escribe quien participa en el proyecto: PM, administrador, o asignado/revisor de alguna de sus tareas.
const schema = commentInputSchema.extend({ scope: z.enum(PROJECT_SCOPES) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withBody(request, schema, (actor, data) => postProjectComment(id, actor, data.scope, data), 201);
}
