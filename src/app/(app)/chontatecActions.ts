"use server";

import { auth } from "@/auth";
import {
  getChontatecHistory,
  sendChontatecMessage as sendMessage,
  confirmChontatecAction as confirmAction,
  clearChontatecHistory,
} from "@/lib/chontatec";

async function requireUserId() {
  const session = await auth();
  if (!session?.user) throw new Error("No autenticado.");
  return session.user.id;
}

export async function getChatHistory() {
  const userId = await requireUserId();
  return getChontatecHistory(userId);
}

export async function sendChontatecMessage(text: string, pathname: string) {
  const userId = await requireUserId();
  return sendMessage(userId, text, pathname);
}

export async function confirmChontatecAction(toolUseId: string, decision: "confirm" | "decline") {
  const userId = await requireUserId();
  return confirmAction(userId, toolUseId, decision);
}

export async function clearChatHistory() {
  const userId = await requireUserId();
  await clearChontatecHistory(userId);
}
