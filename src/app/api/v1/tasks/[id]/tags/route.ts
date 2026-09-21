import { NextResponse } from "next/server";
import { taskVisibleTo } from "@/lib/visibility";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser, safeJson } from "@/lib/apiAuth";
import { setTaskTag } from "@/app/(app)/settings/tags/tagActions";

const bodySchema = z.object({ categoryId: z.string().min(1), name: z.string().min(1) });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!(await taskVisibleTo(id, auth.actor))) return NextResponse.json({ error: "No existe." }, { status: 404 });
  const tags = await prisma.taskTag.findMany({
    where: { taskId: id },
    include: { tag: { include: { category: true } } },
  });
  return NextResponse.json(tags);
}

// Una etiqueta por categoría en cada tarea — si ya había una de esa
// categoría, la reemplaza. Si el nombre no existe todavía en ese proyecto
// bajo esa categoría, se crea solo (mismo criterio que la app web).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = bodySchema.safeParse(parsedBody.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const result = await setTaskTag(id, parsed.data.categoryId, parsed.data.name, auth.actor);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json(result, { status: 201 });
}
