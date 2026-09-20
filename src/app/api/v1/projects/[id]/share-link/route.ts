import { z } from "zod";
import { withAuth, withBody } from "@/lib/apiResult";
import { createShare, getShareLink, revokeShare } from "@/lib/taskDesign";

// Link público (sin cuenta) para que el cliente vea el proyecto, comente, responda preguntas.
// GET: estado del link. POST: crea uno (revoca el anterior). DELETE: lo revoca. Solo PM del proyecto o administrador.
// La respuesta trae `path` (/share/<token>); anteponé la URL del servidor para armar el link completo.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(request, () => getShareLink({ projectId: id }));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withBody(request, z.object({}).passthrough(), (actor) => createShare({ projectId: id }, actor), 201);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(request, (actor) => revokeShare({ projectId: id }, actor));
}
