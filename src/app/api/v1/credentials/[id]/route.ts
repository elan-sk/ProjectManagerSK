import { prisma } from "@/lib/prisma";
import { runAction, withAuth, withBody } from "@/lib/apiResult";
import { canSeeCredential, credentialForApi, logCredentialAccess } from "@/lib/credentials";
import { credentialBodySchema } from "@/lib/credentialInput";
import { deleteCredential, updateCredential } from "@/app/(app)/credentials/actions";

// Una contraseña (credencial): para quien no tiene acceso es como si no existiera (404).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(request, async (actor) => {
    if (!(await canSeeCredential(id, actor))) return { ok: false, status: 404, error: "No existe." };
    const c = await prisma.credential.findUniqueOrThrow({ where: { id }, include: { tasks: { select: { taskId: true } }, allowedUsers: { select: { userId: true } } } });
    await logCredentialAccess([id], actor, "VIEW", "api");
    return { ok: true, credential: credentialForApi(c) };
  });
}

// Edita (quien la creó, PM o administrador). `password` vacío o ausente = se conserva.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withBody(request, credentialBodySchema.omit({ taskId: true }), async (actor, input) => {
    if (!(await canSeeCredential(id, actor))) return { ok: false, status: 404, error: "No existe." };
    return runAction(() => updateCredential(id, input, actor));
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(request, async (actor) => {
    if (!(await canSeeCredential(id, actor))) return { ok: false, status: 404, error: "No existe." };
    return runAction(() => deleteCredential(id, actor));
  });
}
