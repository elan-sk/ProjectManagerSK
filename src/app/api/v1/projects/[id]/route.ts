import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiKey } from "@/lib/apiAuth";
import { getBottlenecks, getProjectDelaySummary } from "@/lib/delays";
import { PUBLIC_USER_SELECT } from "@/lib/publicUser";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      pm: { select: PUBLIC_USER_SELECT },
      phases: { orderBy: { order: "asc" } },
      tasks: {
        include: { assignees: { include: { user: { select: PUBLIC_USER_SELECT } } } },
      },
    },
  });
  if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const [bottlenecks, delays] = await Promise.all([
    getBottlenecks(id),
    getProjectDelaySummary(id),
  ]);

  return NextResponse.json({ ...project, bottlenecks, delays });
}
