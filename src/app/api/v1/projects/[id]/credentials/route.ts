import { prisma } from "@/lib/prisma";
import { runAction, withAuth, withBody } from "@/lib/apiResult";
import { projectVisibleTo } from "@/lib/visibility";
import { credentialForApi, credentialVisibleWhere, logCredentialAccess } from "@/lib/credentials";
import { credentialBodySchema } from "@/lib/credentialInput";
import { createCredential } from "@/app/(app)/credentials/actions";

const INCLUDE = { tasks: { select: { taskId: true } }, allowedUsers: { select: { userId: true } } } as const;

// Contraseñas (credenciales) del proyecto que la persona puede ver, con la contraseña descifrada
// (decisión del usuario: la API la entrega a quien tiene acceso, para poder usarla).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  return withAuth(request, async (actor) => {
    if (!(await projectVisibleTo(projectId, actor))) return { ok: false, status: 404, error: "No existe." };
    const list = await prisma.credential.findMany({ where: { projectId, ...credentialVisibleWhere(actor) }, include: INCLUDE, orderBy: { createdAt: "asc" } });
    await logCredentialAccess(list.map((c) => c.id), actor, "VIEW", "api");
    return { ok: true, credentials: list.map(credentialForApi) };
  });
}

// Crea una contraseña: { name, url?, username?, password, notes?, visibility?, userIds?, taskId? }.
// Sin taskId: PM o administrador. Con taskId: quien puede editar esa tarea (sus asignados la ven).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  return withBody(request, credentialBodySchema, async (actor, { taskId, ...input }) => {
      if (taskId && (await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } }))?.projectId !== projectId) {
        return { ok: false, status: 400, error: "Esa tarea no es de este proyecto." };
      }
      return runAction(() => createCredential(input, taskId ? { taskId } : { projectId }, actor));
    }, 201);
}
