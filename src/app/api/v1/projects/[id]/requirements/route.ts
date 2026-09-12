import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiKey, safeJson } from "@/lib/apiAuth";

// Punto 3.1: un requerimiento se cumple a través de una o varias fases del
// cronograma (phaseIds), y responde a uno o varios objetivos (objectiveIds)
// — mismo modelo que ya usa la Definición del proyecto en la UI.
const createRequirementSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  objectiveIds: z.array(z.string()).optional(),
  phaseIds: z.array(z.string()).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  const { id: projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = createRequirementSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const count = await prisma.requirement.count({ where: { projectId } });
  const requirement = await prisma.requirement.create({
    data: {
      projectId,
      title: data.title,
      description: data.description ?? null,
      order: count,
      objectives: data.objectiveIds ? { connect: data.objectiveIds.map((id) => ({ id })) } : undefined,
      phases: data.phaseIds ? { connect: data.phaseIds.map((id) => ({ id })) } : undefined,
    },
  });
  return NextResponse.json(requirement, { status: 201 });
}
