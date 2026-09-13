import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser, safeJson } from "@/lib/apiAuth";
import { getProjectAdmin } from "@/lib/permissions";

const createPhaseSchema = z.object({ name: z.string().min(1) });

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

  const parsed = createPhaseSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const count = await prisma.phase.count({ where: { projectId } });
  const phase = await prisma.phase.create({ data: { projectId, name: parsed.data.name, order: count } });
  return NextResponse.json(phase, { status: 201 });
}
