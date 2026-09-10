import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiKey, safeJson } from "@/lib/apiAuth";
import { getTaskDelayDays } from "@/lib/delays";
import { notifyBlocked } from "@/lib/notifications";
import { PUBLIC_USER_SELECT } from "@/lib/publicUser";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  const { id } = await params;
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      project: true,
      phase: true,
      assignees: { include: { user: { select: PUBLIC_USER_SELECT } } },
      steps: true,
      attachments: true,
      dependsOn: { include: { predecessor: true } },
    },
  });
  if (!task) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const delayDays =
    task.status === "COMPLETED" ? await getTaskDelayDays(task.project.countryCode, task) : 0;

  return NextResponse.json({ ...task, delayDays });
}

const updateTaskSchema = z.object({
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED"]).optional(),
  title: z.string().min(1).optional(),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  const { id } = await params;
  const task = await prisma.task.findUnique({
    where: { id },
    include: { steps: true, project: { select: { pmId: true } } },
  });
  if (!task) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = updateTaskSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  // Misma regla que la UI (punto 12): con pasos pendientes no se completa.
  if (data.status === "COMPLETED" && task.steps.some((s) => !s.done)) {
    return NextResponse.json(
      { error: "Todavía hay pasos del checklist sin completar" },
      { status: 409 }
    );
  }

  const updated = await prisma.task.update({
    where: { id },
    data: {
      ...data,
      actualStart:
        data.status && data.status !== "NOT_STARTED" && !task.actualStart ? new Date() : undefined,
      actualEnd: data.status === "COMPLETED" ? new Date() : data.status ? null : undefined,
    },
  });

  if (data.status === "BLOCKED" && task.status !== "BLOCKED" && task.project.pmId) {
    await notifyBlocked(id, task.project.pmId);
  }

  return NextResponse.json(updated);
}
