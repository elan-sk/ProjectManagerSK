import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser, safeJson } from "@/lib/apiAuth";
import { getProjectAdmin } from "@/lib/permissions";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

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

  const parsed = createLinkSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const link = await prisma.projectLink.create({ data: { projectId, title: parsed.data.title, url: parsed.data.url } });
  return NextResponse.json(link, { status: 201 });
}
