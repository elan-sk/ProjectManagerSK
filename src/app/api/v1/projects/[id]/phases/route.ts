import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiKey, safeJson } from "@/lib/apiAuth";

const createPhaseSchema = z.object({ name: z.string().min(1) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  const { id: projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = createPhaseSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const count = await prisma.phase.count({ where: { projectId } });
  const phase = await prisma.phase.create({ data: { projectId, name: parsed.data.name, order: count } });
  return NextResponse.json(phase, { status: 201 });
}
