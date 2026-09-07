"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { AttachmentKind } from "@prisma/client";

export async function addStep(taskId: string, formData: FormData) {
  const description = z.string().min(1).parse(formData.get("description"));
  const count = await prisma.taskStep.count({ where: { taskId } });
  await prisma.taskStep.create({ data: { taskId, description, order: count } });
  await revalidateTask(taskId);
}

export async function toggleStep(stepId: string, done: boolean) {
  const step = await prisma.taskStep.update({ where: { id: stepId }, data: { done } });
  await revalidateTask(step.taskId);
}

export async function addAttachmentRecord(
  taskId: string,
  kind: AttachmentKind,
  file: { url: string; name: string; mimeType: string },
  uploadedById: string
) {
  await prisma.attachment.create({
    data: {
      taskId,
      kind,
      fileUrl: file.url,
      fileName: file.name,
      mimeType: file.mimeType,
      uploadedById,
    },
  });
  await revalidateTask(taskId);
}

export async function setDependency(taskId: string, formData: FormData) {
  const predecessorId = formData.get("predecessorId") as string;
  if (!predecessorId || predecessorId === taskId) return;
  await prisma.taskDependency.upsert({
    where: { predecessorId_successorId: { predecessorId, successorId: taskId } },
    update: {},
    create: { predecessorId, successorId: taskId },
  });
  await revalidateTask(taskId);
}

export async function removeDependency(dependencyId: string, taskId: string) {
  await prisma.taskDependency.delete({ where: { id: dependencyId } });
  await revalidateTask(taskId);
}

async function revalidateTask(taskId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  revalidatePath(`/projects/${task.projectId}/tasks/${taskId}`);
}
