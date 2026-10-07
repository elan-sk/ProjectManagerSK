import { z } from "zod";
import { runAction, withAuth, withBody } from "@/lib/apiResult";
import { linkCredentialToTask, unlinkCredentialFromTask } from "@/app/(app)/credentials/actions";

// Agrega una contraseña ya existente del proyecto como insumo de la tarea: { credentialId }.
// Sus asignados ganan acceso y se les avisa (sin la contraseña).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: taskId } = await params;
  return withBody(request, z.object({ credentialId: z.string().min(1) }), (actor, { credentialId }) => runAction(() => linkCredentialToTask(credentialId, taskId, actor)), 201);
}

// Quita la contraseña de la tarea (sigue en el proyecto): DELETE ?credentialId=…
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: taskId } = await params;
  const credentialId = new URL(request.url).searchParams.get("credentialId") ?? "";
  return withAuth(request, (actor) => runAction(() => unlinkCredentialFromTask(credentialId, taskId, actor)));
}
