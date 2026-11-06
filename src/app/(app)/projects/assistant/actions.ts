"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getBotSettings } from "@/lib/botSettings";
import { confirmModeAction, getModeHistory, sendModeMessage } from "@/lib/chontatec";
import { canUseProjectAssistant, moveNewProjectConversation, projectAssistantMode, projectChannel, projectSteps } from "@/lib/projectAssistant";

const NO_ACCESS = "No tiene acceso a este asistente.";

async function guard(projectId: string | null) {
  const session = await auth();
  if (!session?.user || !(await canUseProjectAssistant(session.user, projectId))) throw new Error(NO_ACCESS);
  return session.user;
}

async function result(userId: string, projectId: string | null, messages: Awaited<ReturnType<typeof getModeHistory>>, redirect: string | null = null) {
  return { messages, steps: await projectSteps(userId, projectId), redirect };
}

export async function getProjectAssistantState(projectId: string | null) {
  const user = await guard(projectId);
  const { mode } = projectAssistantMode(projectId, user);
  const [messages, settings] = await Promise.all([getModeHistory(user.id, mode), getBotSettings()]);
  return { ...(await result(user.id, projectId, messages)), aiConfigured: settings.apiKeyConfigured };
}

export async function sendProjectAssistantMessage(projectId: string | null, text: string) {
  const user = await guard(projectId);
  const { mode } = projectAssistantMode(projectId, user);
  const messages = await sendModeMessage(user.id, text, mode);
  if (projectId) revalidatePath(`/projects/${projectId}`);
  return result(user.id, projectId, messages);
}

export async function confirmProjectAssistantAction(projectId: string | null, toolUseId: string, decision: "confirm" | "decline") {
  const user = await guard(projectId);
  const { mode, created } = projectAssistantMode(projectId, user);
  const messages = await confirmModeAction(user.id, toolUseId, decision, mode);
  revalidatePath("/projects");
  if (!projectId && created.projectId) {
    await moveNewProjectConversation(user.id, created.projectId);
    return result(user.id, created.projectId, await getModeHistory(user.id, projectAssistantMode(created.projectId, user).mode), `/projects/assistant?project=${created.projectId}`);
  }
  if (projectId) revalidatePath(`/projects/${projectId}`);
  return result(user.id, projectId, messages);
}

export async function restartProjectAssistant(projectId: string | null) {
  const user = await guard(projectId);
  await prisma.botMessage.deleteMany({ where: { userId: user.id, channel: projectChannel(projectId) } });
  return result(user.id, projectId, []);
}
