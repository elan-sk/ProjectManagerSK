import { z } from "zod";
import { runAction, withAuth, withBody } from "@/lib/apiResult";
import { addProjectRepo, removeProjectRepo } from "@/app/(app)/projects/[id]/taskOps";

// Repositorios del proyecto. POST { url } agrega (el primero queda como principal: repoUrl).
// DELETE ?url=… quita uno (si era el principal, el siguiente ocupa su lugar). Solo PM o administrador.
type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  return withBody(request, z.object({ url: z.string().min(1) }), (actor, data) => runAction(() => addProjectRepo(id, data.url, actor)), 201);
}

export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const url = new URL(request.url).searchParams.get("url") ?? "";
  return withAuth(request, (actor) => (url ? runAction(() => removeProjectRepo(id, url, actor)) : Promise.resolve({ ok: false, status: 400, error: "Falta ?url=" })));
}
