import { NextResponse } from "next/server";
import { taskVisibleTo } from "@/lib/visibility";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser, safeJson } from "@/lib/apiAuth";
import { setDependency } from "@/app/(app)/projects/[id]/tasks/[taskId]/actions";

const bodySchema = z.object({
  predecessorId: z.string().min(1),
  type: z.enum(["FINISH_TO_START", "START_TO_START"]).default("FINISH_TO_START"),
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!(await taskVisibleTo(id, auth.actor))) return NextResponse.json({ error: "No existe." }, { status: 404 });
  const deps = await prisma.taskDependency.findMany({
    where: { successorId: id },
    include: { predecessor: { select: { id: true, title: true, status: true } } },
  });
  return NextResponse.json(deps);
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
  formData.set("predecessorId", parsed.data.predecessorId);
  formData.set("type", parsed.data.type);

  try {
    await setDependency(id, formData, auth.actor);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 403 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
