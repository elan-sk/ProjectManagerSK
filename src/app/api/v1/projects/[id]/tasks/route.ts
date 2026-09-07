import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiKey } from "@/lib/apiAuth";
import { addBusinessDays } from "@/lib/holidays";
import { notifyAssignment } from "@/lib/notifications";
import { PUBLIC_USER_SELECT } from "@/lib/publicUser";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  const { id: projectId } = await params;
  const tasks = await prisma.task.findMany({
    where: { projectId },
    include: {
      assignees: { include: { user: { select: PUBLIC_USER_SELECT } } },
      steps: true,
      phase: true,
    },
    orderBy: { plannedStart: "asc" },
  });
  return NextResponse.json(tasks);
}

const createTaskSchema = z.object({
  phaseId: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(["SIMPLE", "CHECKLIST", "MILESTONE", "MEETING", "QA", "ADJUSTMENT"]).default("SIMPLE"),
  plannedStart: z.coerce.date(),
  durationDays: z.coerce.number().int().min(1).default(1),
  assigneeIds: z.array(z.string()).min(1),
  dependsOnTaskIds: z.array(z.string()).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  const { id: projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  const parsed = createTaskSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const plannedEnd =
    data.durationDays <= 1
      ? data.plannedStart
      : await addBusinessDays(project.countryCode, data.plannedStart, data.durationDays - 1);

  const task = await prisma.task.create({
    data: {
      projectId,
      phaseId: data.phaseId,
      title: data.title,
      type: data.type,
      plannedStart: data.plannedStart,
      plannedEnd,
      assignees: { create: data.assigneeIds.map((userId) => ({ userId })) },
      dependsOn: data.dependsOnTaskIds
        ? { create: data.dependsOnTaskIds.map((predecessorId) => ({ predecessorId })) }
        : undefined,
    },
  });

  await notifyAssignment(task.id, data.assigneeIds);

  return NextResponse.json(task, { status: 201 });
}
