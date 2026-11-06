"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getBotSettings } from "@/lib/botSettings";
import { confirmModeAction, getModeHistory, sendModeMessage } from "@/lib/chontatec";
import { canUseTaskAssistant, taskAssistantMode, taskChannel, taskSteps } from "@/lib/projectAssistant";

async function guard(projectId: string, taskId: string | null) {
  const session = await auth();
  if (!session?.user || !(await canUseTaskAssistant(session.user, projectId, taskId))) throw new Error("No tiene acceso a este asistente.");
  return session.user;
}

export async function getTaskAssistantState(projectId: string, taskId: string | null) {
  const user = await guard(projectId, taskId);
  const [messages, settings] = await Promise.all([getModeHistory(user.id, taskAssistantMode(projectId, taskId, user).mode), getBotSettings()]);
  return { messages, steps: await taskSteps(user.id, projectId, taskId), aiConfigured: settings.apiKeyConfigured };
}

export async function sendTaskAssistantMessage(projectId: string, taskId: string | null, text: string) {
  const user = await guard(projectId, taskId);
  const messages = await sendModeMessage(user.id, text, taskAssistantMode(projectId, taskId, user).mode);
  return { messages, steps: await taskSteps(user.id, projectId, taskId) };
}

export async function confirmTaskAssistantAction(projectId: string, taskId: string | null, toolUseId: string, decision: "confirm" | "decline") {
  const user = await guard(projectId, taskId);
  const messages = await confirmModeAction(user.id, toolUseId, decision, taskAssistantMode(projectId, taskId, user).mode);
  revalidatePath(`/projects/${projectId}`);
  if (taskId) revalidatePath(`/projects/${projectId}/tasks/${taskId}`);
  return { messages, steps: await taskSteps(user.id, projectId, taskId) };
}

export async function restartTaskAssistant(projectId: string, taskId: string | null) {
  const user = await guard(projectId, taskId);
  await prisma.botMessage.deleteMany({ where: { userId: user.id, channel: taskChannel(projectId, taskId) } });
  return { messages: [], steps: await taskSteps(user.id, projectId, taskId) };
}
