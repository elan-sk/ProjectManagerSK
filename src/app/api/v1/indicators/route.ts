import { withAuth } from "@/lib/apiResult";
import { prisma } from "@/lib/prisma";
import { computeIndicators } from "@/lib/companyIndicators";
import { managedProjectWhere } from "@/lib/permissions";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  const days = Number(url.searchParams.get("days") ?? "") || null;
  const clientId = url.searchParams.get("clientId");
  return withAuth(request, async (actor) => {
    if (actor.role !== "ADMIN") {
      if (!projectId) return { ok: false, status: 403, error: "Los indicadores de la empresa son solo para administradores." };
      if (!(await prisma.project.count({ where: { id: projectId, ...managedProjectWhere(actor.id) } }))) return { ok: false, status: 403, error: "Solo el PM del proyecto o un administrador." };
    }
    const indicators = await computeIndicators({ projectIds: projectId ? [projectId] : null, from: days ? new Date(Date.now() - days * 86_400_000) : null, clientId });
    return { ok: true, indicators };
  });
}
