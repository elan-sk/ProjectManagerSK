import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser, safeJson } from "@/lib/apiAuth";
import { getProjectAdmin } from "@/lib/permissions";

const createObjectiveSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id: projectId } = await params;
  if (!(await getProjectAdmin(projectId, auth.actor))) {
    return NextResponse.json({ error: "Solo el PM de este proyecto o un administrador pueden hacer esto." }, { status: 403 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = createObjectiveSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const count = await prisma.objective.count({ where: { projectId } });
  const objective = await prisma.objective.create({
    data: { projectId, title: parsed.data.title, description: parsed.data.description ?? null, order: count },
  });
  return NextResponse.json(objective, { status: 201 });
}
