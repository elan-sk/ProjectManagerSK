import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser, safeJson } from "@/lib/apiAuth";
import { addStep } from "@/app/(app)/projects/[id]/tasks/[taskId]/actions";

const bodySchema = z.object({ description: z.string().min(1) });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const steps = await prisma.taskStep.findMany({ where: { taskId: id }, orderBy: { order: "asc" } });
  return NextResponse.json(steps);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = bodySchema.safeParse(parsedBody.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const formData = new FormData();
  formData.set("description", parsed.data.description);

  try {
    await addStep(id, formData, auth.actor);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 403 });
  }
  const step = await prisma.taskStep.findFirst({ where: { taskId: id }, orderBy: { order: "desc" } });
  return NextResponse.json(step, { status: 201 });
}
