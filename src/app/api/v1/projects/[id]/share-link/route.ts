import { z } from "zod";
import { projectVisibleTo } from "@/lib/visibility";
import { withAuth, withBody } from "@/lib/apiResult";
import { createShare, getShareLink, revokeShare } from "@/lib/taskDesign";

// Link público (sin cuenta) para que el cliente vea el proyecto, comente, responda preguntas.
// GET: estado del link. POST: crea uno (revoca el anterior). DELETE: lo revoca. Solo PM del proyecto o administrador.
// La respuesta trae `path` (/share/<token>); anteponé la URL del servidor para armar el link completo.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(request, async (actor) => ((await projectVisibleTo(id, actor)) ? getShareLink({ projectId: id }) : { ok: false, status: 404, error: "No existe." }));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withBody(request, z.object({}).passthrough(), (actor) => createShare({ projectId: id }, actor), 201);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(request, (actor) => revokeShare({ projectId: id }, actor));
}
