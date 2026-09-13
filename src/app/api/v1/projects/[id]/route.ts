import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser, safeJson } from "@/lib/apiAuth";
import { getBottlenecks, getProjectDelaySummary } from "@/lib/delays";
import { PUBLIC_USER_SELECT } from "@/lib/publicUser";
import { getProjectAdmin } from "@/lib/permissions";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      pm: { select: PUBLIC_USER_SELECT },
      phases: { orderBy: { order: "asc" } },
      tasks: {
        include: { assignees: { include: { user: { select: PUBLIC_USER_SELECT } } } },
      },
    },
  });
  if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const [bottlenecks, delays] = await Promise.all([
    getBottlenecks(id),
    getProjectDelaySummary(id),
  ]);

  return NextResponse.json({ ...project, bottlenecks, delays });
}

// Punto 3.1 (skill dev-project-definer): completar la descripción/fechas del
// proyecto una vez creado — la info que no encaje en objetivos/requerimientos/
// fases va acá, nunca se descarta solo por no tener un campo propio.
const updateProjectSchema = z.object({
  description: z.string().optional(),
  targetEndDate: z.coerce.date().optional(),
  clientName: z.string().optional(),
  repoUrl: z.string().url().optional(),
  color: z.string().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!(await getProjectAdmin(id, auth.actor))) {
    return NextResponse.json({ error: "Solo el PM de este proyecto o un administrador pueden editarlo." }, { status: 403 });
  }

  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = updateProjectSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const project = await prisma.project.update({ where: { id }, data: parsed.data }).catch(() => null);
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  return NextResponse.json(project);
}
