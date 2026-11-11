"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getBotSettings } from "@/lib/botSettings";
import { confirmModeAction, getModeHistory, sendModeMessage } from "@/lib/chontatec";
import { clientAssistantMode, clientChannel, clientSteps } from "@/lib/projectAssistant";
import { canUseClientAssistant } from "@/lib/clients";

async function requireAdminId(clientId: string | null) {
  const session = await auth();
  if (!session?.user || !(await canUseClientAssistant(session.user, clientId))) throw new Error("No tiene permiso para usar el asistente de clientes.");
  if (clientId && !(await prisma.client.count({ where: { id: clientId } }))) throw new Error("Ese cliente ya no existe.");
  return session.user.id;
}

export async function getClientAssistantState(clientId: string | null) {
  const userId = await requireAdminId(clientId);
  const [messages, settings] = await Promise.all([getModeHistory(userId, clientAssistantMode(clientId).mode), getBotSettings()]);
  return { messages, steps: await clientSteps(userId, clientId), aiConfigured: settings.apiKeyConfigured };
}

export async function sendClientAssistantMessage(clientId: string | null, text: string) {
  const userId = await requireAdminId(clientId);
  const messages = await sendModeMessage(userId, text, clientAssistantMode(clientId).mode);
  return { messages, steps: await clientSteps(userId, clientId) };
}

export async function confirmClientAssistantAction(clientId: string | null, toolUseId: string, decision: "confirm" | "decline") {
  const userId = await requireAdminId(clientId);
  const { mode, created } = clientAssistantMode(clientId);
  const messages = await confirmModeAction(userId, toolUseId, decision, mode);
  revalidatePath("/company");
  if (!clientId && created.clientId) {
    await prisma.botMessage.deleteMany({ where: { userId, channel: clientChannel(null) } });
    return { messages: [], steps: await clientSteps(userId), redirect: `/clients/${created.clientId}` };
  }
  if (clientId) revalidatePath(`/clients/${clientId}`);
  return { messages, steps: await clientSteps(userId, clientId) };
}

export async function restartClientAssistant(clientId: string | null) {
  const userId = await requireAdminId(clientId);
  await prisma.botMessage.deleteMany({ where: { userId, channel: clientChannel(clientId) } });
  return { messages: [], steps: await clientSteps(userId, clientId) };
}
