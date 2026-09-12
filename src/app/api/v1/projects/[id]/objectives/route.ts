import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiKey, safeJson } from "@/lib/apiAuth";

const createObjectiveSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  const { id: projectId } = await params;
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
