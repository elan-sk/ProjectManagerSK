"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getBotSettings } from "@/lib/botSettings";
import { confirmModeAction, getModeHistory, sendModeMessage } from "@/lib/chontatec";
import { companyAssistantMode } from "@/lib/companyAssistant";
import { COMPANY_NAME_KEY, getCompanyProfile, removeCompanyDocument, saveCompanyTopic, setCompanyFocus, topicStates } from "@/lib/companyProfile";
import { TASK_TYPE_LABEL } from "@/lib/statusColors";
import { getCompanyBrand, saveCompanyBrand, type BrandInput } from "@/lib/companyBrand";

const NOT_ADMIN = "Esta sección es solo para administradores.";

async function requireAdminId() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error(NOT_ADMIN);
  return session.user.id;
}

export type CompanyProfileUi = Awaited<ReturnType<typeof profileUi>>;

async function profileUi() {
  const profile = await getCompanyProfile();
  const { items, covered, total } = topicStates(profile.topics, profile.focus);
  return {
    name: profile.name,
    items,
    covered,
    total,
    taskTypes: profile.taskTypes.filter((m) => m.unused || m.meaning?.trim()).map((m) => ({ label: TASK_TYPE_LABEL[m.type], text: m.unused ? "No se usa" : m.meaning! })),
    documents: profile.documents,
    brand: await getCompanyBrand(),
  };
}

export async function getCompanyProfileUi() {
  await requireAdminId();
  return profileUi();
}

export async function getCompanyAssistantState() {
  const userId = await requireAdminId();
  const [messages, profile, settings] = await Promise.all([getModeHistory(userId, companyAssistantMode()), profileUi(), getBotSettings()]);
  return { messages, profile, aiConfigured: settings.apiKeyConfigured };
}

export async function sendCompanyAssistantMessage(text: string) {
  const userId = await requireAdminId();
  const messages = await sendModeMessage(userId, text, companyAssistantMode());
  revalidatePath("/company");
  return { messages, profile: await profileUi() };
}

export async function confirmCompanyAssistantAction(toolUseId: string, decision: "confirm" | "decline") {
  const userId = await requireAdminId();
  const messages = await confirmModeAction(userId, toolUseId, decision, companyAssistantMode());
  revalidatePath("/company");
  return { messages, profile: await profileUi() };
}

export async function restartCompanyAssistant() {
  const userId = await requireAdminId();
  await prisma.botMessage.deleteMany({ where: { userId, channel: "company" } });
  await setCompanyFocus(null);
  return { messages: [], profile: await profileUi() };
}

export async function saveCompanyTopicText(key: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await requireAdminId();
    if (key === COMPANY_NAME_KEY && !text.trim()) return { ok: false, error: "Falta indicar el nombre de la empresa." };
    if (text.length > 20000) return { ok: false, error: "El texto es demasiado largo." };
    await saveCompanyTopic(key, text, userId);
    revalidatePath("/company");
    return { ok: true };
  } catch (err) {
    console.error("[empresa] no se pudo guardar el tema", err);
    return { ok: false, error: (err as Error).message === NOT_ADMIN ? NOT_ADMIN : "No se pudo guardar. Intentarlo de nuevo en un momento." };
  }
}

export async function removeCompanyDocumentAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireAdminId();
    await removeCompanyDocument(id);
    revalidatePath("/company");
    return { ok: true };
  } catch (err) {
    console.error("[empresa] no se pudo quitar el documento", err);
    return { ok: false, error: (err as Error).message === NOT_ADMIN ? NOT_ADMIN : "No se pudo quitar el documento. Intentarlo de nuevo en un momento." };
  }
}

export async function saveCompanyBrandAction(input: BrandInput): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireAdminId();
    const result = await saveCompanyBrand(input);
    if (result.ok) revalidatePath("/company");
    return result;
  } catch (err) {
    console.error("[empresa] no se pudo guardar la identidad", err);
    return { ok: false, error: (err as Error).message === NOT_ADMIN ? NOT_ADMIN : "No se pudo guardar. Intentarlo de nuevo en un momento." };
  }
}
