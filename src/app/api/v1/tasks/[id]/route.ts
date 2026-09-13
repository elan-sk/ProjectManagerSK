import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser, safeJson } from "@/lib/apiAuth";
import { getTaskDelayDays } from "@/lib/delays";
import { PUBLIC_USER_SELECT } from "@/lib/publicUser";
import { canEditTask } from "@/lib/permissions";
import { updateTaskStatus } from "@/app/(app)/projects/[id]/actions";
import { deleteTask } from "@/app/(app)/projects/[id]/tasks/[taskId]/actions";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

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
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id }, select: { status: true, projectId: true } });
  if (!task) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  if (!(await canEditTask(id, auth.actor))) {
    return NextResponse.json(
      { error: "Solo un asignado a esta tarea, el PM del proyecto o un administrador pueden editarla." },
      { status: 403 }
    );
  }

  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) return parsedBody.error;

  const parsed = updateTaskSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { status, ...rest } = parsed.data;

  // El estado tiene reglas propias bastante más finas (checklist, evidencia,
  // ronda de revisión aprobada, "Devuelta" bloqueada, reabrir una completada
  // exige PM/admin) y ya dispara sola la notificación de "Bloqueada" — se
  // delega en la MISMA función que usa la app web en vez de reimplementarlas
  // acá aparte (esta ruta ya tenía una copia vieja e incompleta de esas
  // reglas — quedaba corregida a medias).
  if (status) {
    const result = await updateTaskStatus(id, status, undefined, auth.actor);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  }

  const hasOtherFields = Object.keys(rest).length > 0;
  const updated = hasOtherFields
    ? await prisma.task.update({ where: { id }, data: rest })
    : await prisma.task.findUniqueOrThrow({ where: { id } });

  return NextResponse.json(updated);
}

// Solo PM del proyecto o admin (mismo criterio que borrar desde la app web).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const result = await deleteTask(id, auth.actor);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json({ ok: true });
}
