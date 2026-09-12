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
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "RETURNED"]).optional(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  phaseId: z.string().min(1).optional(),
  meetingUrl: z.string().url().nullable().optional(),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireApiKey(request);
  if (denied) return denied;

  const { id } = await params;
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      steps: true,
      project: { select: { pmId: true } },
      attachments: { select: { kind: true } },
      adjustmentItems: { include: { attachments: { select: { kind: true } } } },
    },
  });
  if (!task) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = updateTaskSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  // Mismas reglas que la UI (punto 12 y punto 2): con pasos pendientes, sin
  // evidencia (Entregable) o con cambios sin responder (Ajuste) no se completa.
  if (data.status === "COMPLETED" && task.steps.some((s) => !s.done)) {
    return NextResponse.json(
      { error: "Todavía hay pasos del checklist sin completar" },
      { status: 409 }
    );
  }
  if (data.status === "COMPLETED" && task.type === "MILESTONE" && !task.attachments.some((a) => a.kind === "RESULTADO")) {
    return NextResponse.json(
      { error: "Este entregable necesita al menos una evidencia cargada para poder completarse" },
      { status: 409 }
    );
  }
  if (data.status === "COMPLETED" && task.type === "ADJUSTMENT") {
    const pending = task.adjustmentItems.filter(
      (item) => !item.note && !item.attachments.some((a) => a.kind === "AFTER")
    );
    if (pending.length > 0) {
      return NextResponse.json(
        { error: `Todavía hay ${pending.length} cambio(s) sin responder` },
        { status: 409 }
      );
    }
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
