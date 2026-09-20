import { z } from "zod";
import { withAuth, withBody } from "@/lib/apiResult";
import { createShare, getShareLink, revokeShare } from "@/lib/taskDesign";

// Link público (sin cuenta) para que el cliente vea la tarea, comente, responda preguntas, califique ajustes y acepte o devuelva características.
// GET: estado del link. POST: crea uno (revoca el anterior). DELETE: lo revoca. Asignado, PM o administrador.
// La respuesta trae `path` (/share/<token>); anteponé la URL del servidor para armar el link completo.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(request, () => getShareLink({ taskId: id }));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withBody(request, z.object({}).passthrough(), (actor) => createShare({ taskId: id }, actor), 201);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(request, (actor) => revokeShare({ taskId: id }, actor));
}
