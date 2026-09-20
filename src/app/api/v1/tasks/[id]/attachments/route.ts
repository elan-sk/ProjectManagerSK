import { z } from "zod";
import { withAuth, withBody } from "@/lib/apiResult";
import { addTaskAttachments, fileRefSchema, listTaskAttachments } from "@/lib/taskDesign";

// Insumos y Evidencias de una tarea. GET: lista. POST: { kind: "INSUMO" | "RESULTADO", files: [{ url, name, mimeType? }] }.
// Requiere ser asignado, PM o administrador; una tarea completada ya no admite más archivos.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(request, (actor) => listTaskAttachments(id, actor));
}

const schema = z.object({ kind: z.enum(["INSUMO", "RESULTADO"]), files: z.array(fileRefSchema).min(1).max(20) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withBody(request, schema, (actor, data) => addTaskAttachments(id, actor, data.kind, data.files), 201);
}
