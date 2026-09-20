import { z } from "zod";
import { withBody } from "@/lib/apiResult";
import { commentInputSchema, postTaskComment, TASK_SCOPES } from "@/lib/threadsApi";

// Publica un comentario o una pregunta de selección en un hilo de la tarea.
//   scope: "task"             comentario general (lo ve el cliente por su link; admite imágenes y archivos, que quedan como Insumos)
//          "adjustment_item"  hilo de un cambio de un Ajuste            (targetId = id del cambio)
//          "acceptance_check" hilo de una característica de Aceptación  (targetId = id de la característica)
//          "qa_check"         hilo interno de una prueba                (targetId = id de la prueba; admite menciones)
//          "round"            hilo interno de una ronda                 (targetId = id de la ronda)
//          "conversation"     conversación interna de la tarea          (admite menciones)
//   body, parentId? (responder), mentions? [userId], attachments? [{ url, name, mimeType? }],
//   poll? { multiple, options: [texto] } -> el comentario pasa a ser una pregunta y `body` es el enunciado.
// Los permisos son los de la app: escribe quien edita o revisa la tarea (asignado, revisor, PM o administrador).
const schema = commentInputSchema.extend({ scope: z.enum(TASK_SCOPES), targetId: z.string().optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withBody(request, schema, (actor, data) => postTaskComment(id, actor, data.scope, data.targetId, data), 201);
}
