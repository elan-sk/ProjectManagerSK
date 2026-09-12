import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiKey, safeJson } from "@/lib/apiAuth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  const { id: projectId } = await params;
  const links = await prisma.projectLink.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  return NextResponse.json(links);
}

const createLinkSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
});

// Punto 3.2: archivos y enlaces importantes del proyecto — preferir el link
// (Drive, Figma, repo) sobre subir el archivo a esta app.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  const { id: projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = createLinkSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const link = await prisma.projectLink.create({ data: { projectId, title: parsed.data.title, url: parsed.data.url } });
  return NextResponse.json(link, { status: 201 });
}
