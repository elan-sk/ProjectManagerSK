import { NextResponse } from "next/server";
import { projectVisibleTo } from "@/lib/visibility";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser, safeJson } from "@/lib/apiAuth";
import { addBusinessDays } from "@/lib/holidays";
import { notifyAssignment } from "@/lib/notifications";
import { PUBLIC_USER_SELECT } from "@/lib/publicUser";
import { getProjectAdmin } from "@/lib/permissions";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id: projectId } = await params;
  if (!(await projectVisibleTo(projectId, auth.actor))) return NextResponse.json({ error: "No existe." }, { status: 404 });
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
  // Punto 3.3: aprovechar el espacio disponible — descripción clara, precisa
  // y orientada a la acción, para que quien la ejecute no tenga ambigüedad.
  description: z.string().nullable().optional(),
  type: z.enum(["SIMPLE", "MILESTONE", "QA", "ADJUSTMENT", "ACCEPTANCE"]).default("SIMPLE"),
  meetingUrl: z.string().url().nullable().optional(),
  plannedStart: z.coerce.date(),
  durationDays: z.coerce.number().int().min(1).default(1),
  assigneeIds: z.array(z.string()).min(1),
  dependsOnTaskIds: z.array(z.string()).optional(),
  // Solo tiene sentido (y solo se usa) para type="QA" — mismos campos que la
  // creación desde la app web (ver addTask en projects/[id]/actions.ts).
  reviewerIds: z.array(z.string()).default([]),
  defaultTestTemplateId: z.string().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id: projectId } = await params;
  if (!(await getProjectAdmin(projectId, auth.actor))) {
    return NextResponse.json({ error: "Solo el PM de este proyecto o un administrador pueden crear tareas." }, { status: 403 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = createTaskSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  // Un asignado no puede ser también revisor de la misma tarea (mismo
  // criterio que la app web — ver addTask).
  if (data.type === "QA" && data.reviewerIds.some((id) => data.assigneeIds.includes(id))) {
    return NextResponse.json({ error: "Un asignado a la tarea no puede ser también su revisor." }, { status: 409 });
  }

  const plannedEnd =
    data.durationDays <= 1
      ? data.plannedStart
      : await addBusinessDays(project.countryCode, data.plannedStart, data.durationDays - 1);

  const task = await prisma.task.create({
    data: {
      projectId,
      phaseId: data.phaseId,
      title: data.title,
      description: data.description ?? null,
      type: data.type,
      meetingUrl: data.meetingUrl ?? null,
      plannedStart: data.plannedStart,
      plannedEnd,
      assignees: { create: data.assigneeIds.map((userId) => ({ userId })) },
      reviewers: data.type === "QA" ? { create: data.reviewerIds.map((userId) => ({ userId })) } : undefined,
      defaultTestTemplateId: data.type === "QA" ? data.defaultTestTemplateId : undefined,
      dependsOn: data.dependsOnTaskIds
        ? { create: data.dependsOnTaskIds.map((predecessorId) => ({ predecessorId })) }
        : undefined,
    },
  });

  await notifyAssignment(task.id, data.assigneeIds);

  return NextResponse.json(task, { status: 201 });
}
