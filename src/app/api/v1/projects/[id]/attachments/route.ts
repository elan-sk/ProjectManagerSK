import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser, safeJson } from "@/lib/apiAuth";
import { addProjectAttachment } from "@/app/(app)/projects/[id]/definitionActions";

const bodySchema = z.object({ url: z.string().min(1), name: z.string().min(1), mimeType: z.string().min(1) });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const attachments = await prisma.projectAttachment.findMany({ where: { projectId: id }, orderBy: { uploadedAt: "desc" } });
  return NextResponse.json(attachments);
}

// El archivo en sí se sube primero a POST /api/upload (con el mismo token)
// para conseguir { url, name, mimeType } — esto solo lo adjunta al proyecto.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = bodySchema.safeParse(parsedBody.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const result = await addProjectAttachment(id, parsed.data, auth.actor);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json(result, { status: 201 });
}
