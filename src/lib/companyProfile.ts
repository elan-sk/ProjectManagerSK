import type { TaskType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { APP_SETTING_ID } from "@/lib/appSettings";
import { TASK_TYPE_LABEL } from "@/lib/statusColors";

export const COMPANY_NAME_KEY = "name";

export const COMPANY_TOPICS = [
  { key: "sector", label: "Sector", isPublic: true },
  { key: "business", label: "Qué hace", isPublic: true },
  { key: "history", label: "Historia", isPublic: true },
  { key: "purpose", label: "Propósito", isPublic: true },
  { key: "workflow", label: "Cómo trabaja", isPublic: true },
  { key: "clients", label: "Clientes", isPublic: false },
  { key: "portfolio", label: "Portafolio", isPublic: true },
  { key: "growth", label: "Crecimiento", isPublic: false },
  { key: "app_goals", label: "Qué quiere revisar con la aplicación", isPublic: false },
  { key: "advice", label: "Consejos que espera", isPublic: false },
] as const;

export type CompanyTopicKey = (typeof COMPANY_TOPICS)[number]["key"];
export const COMPANY_TOPIC_KEYS = COMPANY_TOPICS.map((t) => t.key) as [CompanyTopicKey, ...CompanyTopicKey[]];
export const TASK_TYPES: TaskType[] = ["SIMPLE", "MILESTONE", "QA", "ADJUSTMENT", "ACCEPTANCE"];

export type TopicRow = { key: string; text: string | null; skipped: boolean };
export type TaskTypeMeaning = { type: TaskType; meaning: string | null; unused: boolean };
export type CompanyDocumentRow = { id: string; url: string; name: string; mimeType: string };
export type TopicState = "pending" | "current" | "covered";

export type CompanyProfile = {
  name: string | null;
  topics: TopicRow[];
  documents: CompanyDocumentRow[];
  taskTypes: TaskTypeMeaning[];
  focus: string | null;
};

export function topicStates(topics: TopicRow[], focus: string | null) {
  const byKey = new Map(topics.map((t) => [t.key, t]));
  const items = COMPANY_TOPICS.map((t) => {
    const row = byKey.get(t.key);
    const text = row?.text?.trim() || null;
    const state: TopicState = t.key === focus ? "current" : text ? "covered" : "pending";
    return { key: t.key, label: t.label, isPublic: t.isPublic, text, skipped: !text && Boolean(row?.skipped), state };
  });
  return { items, covered: items.filter((i) => i.text).length, total: items.length };
}

export function nextPendingTopic(topics: TopicRow[], after?: string | null): CompanyTopicKey | null {
  const byKey = new Map(topics.map((t) => [t.key, t]));
  const start = after ? COMPANY_TOPIC_KEYS.indexOf(after as CompanyTopicKey) + 1 : 0;
  const ordered = [...COMPANY_TOPIC_KEYS.slice(start), ...COMPANY_TOPIC_KEYS.slice(0, Math.max(start, 0))];
  return ordered.find((k) => !byKey.get(k)?.text?.trim() && !byKey.get(k)?.skipped) ?? null;
}

export function taskTypeContext(meanings: TaskTypeMeaning[]): string {
  const lines = meanings
    .filter((m) => m.unused || m.meaning?.trim())
    .map((m) => `- ${TASK_TYPE_LABEL[m.type]} (${m.type}): ${m.unused ? "No se usa en esta empresa" : m.meaning!.trim()}`);
  return lines.length ? `Tipos de tarea en esta empresa (elegí el tipo de cada tarea nueva según esto; uno que «No se usa» no lo propongas salvo que lo pidan):\n${lines.join("\n")}` : "";
}

export function profileViewFor(profile: CompanyProfile, isAdmin: boolean) {
  const { items, covered, total } = topicStates(profile.topics, null);
  const visible = items.filter((i) => isAdmin || i.isPublic);
  return {
    name: profile.name,
    topics: visible.map((i) => ({ topic: i.label, text: i.text ?? "(sin información)" })),
    taskTypes: profile.taskTypes
      .filter((m) => m.unused || m.meaning?.trim())
      .map((m) => ({ type: TASK_TYPE_LABEL[m.type], meaning: m.unused ? "No se usa" : m.meaning })),
    ...(isAdmin
      ? { documents: profile.documents.map((d) => ({ name: d.name, url: d.url })), progress: `${covered} de ${total}` }
      : { note: "Solo la parte institucional. Clientes, crecimiento, objetivos con la aplicación, consejos y conclusiones sobre la empresa son solo para administradores." }),
  };
}

export async function getCompanyProfile(): Promise<CompanyProfile> {
  const [rows, documents, taskTypes, setting] = await Promise.all([
    prisma.companyProfileTopic.findMany({ select: { key: true, text: true, skipped: true } }),
    prisma.companyDocument.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, url: true, name: true, mimeType: true } }),
    prisma.companyTaskTypeMeaning.findMany({ select: { type: true, meaning: true, unused: true } }),
    prisma.appSetting.findUnique({ where: { id: APP_SETTING_ID }, select: { companyAssistantFocus: true } }),
  ]);
  const name = rows.find((r) => r.key === COMPANY_NAME_KEY)?.text?.trim() || null;
  const ordered = TASK_TYPES.map((type) => taskTypes.find((t) => t.type === type) ?? { type, meaning: null, unused: false });
  return { name, topics: rows.filter((r) => r.key !== COMPANY_NAME_KEY), documents, taskTypes: ordered, focus: setting?.companyAssistantFocus ?? null };
}

export function isCompanyTopicKey(key: string): key is CompanyTopicKey {
  return (COMPANY_TOPIC_KEYS as string[]).includes(key);
}

export async function saveCompanyTopic(key: string, text: string, userId: string | null) {
  if (key !== COMPANY_NAME_KEY && !isCompanyTopicKey(key)) throw new Error("Ese tema no existe.");
  const clean = text.trim() || null;
  await prisma.companyProfileTopic.upsert({
    where: { key },
    create: { key, text: clean, skipped: false, updatedById: userId },
    update: { text: clean, skipped: false, updatedById: userId },
  });
}

export async function skipCompanyTopic(key: CompanyTopicKey, userId: string | null) {
  await prisma.companyProfileTopic.upsert({ where: { key }, create: { key, skipped: true, updatedById: userId }, update: { skipped: true, updatedById: userId } });
}

export async function setCompanyFocus(key: string | null) {
  await prisma.appSetting.upsert({ where: { id: APP_SETTING_ID }, create: { id: APP_SETTING_ID, companyAssistantFocus: key }, update: { companyAssistantFocus: key } });
}

export async function addCompanyDocument(file: { url: string; name: string; mimeType: string }, userId: string | null) {
  const existing = await prisma.companyDocument.findFirst({ where: { url: file.url }, select: { id: true } });
  if (existing) return;
  await prisma.companyDocument.create({ data: { ...file, addedById: userId } });
}

export async function removeCompanyDocument(id: string) {
  await prisma.companyDocument.delete({ where: { id } });
}

export async function saveTaskTypeMeanings(meanings: TaskTypeMeaning[]) {
  await prisma.$transaction(
    meanings.map((m) =>
      prisma.companyTaskTypeMeaning.upsert({
        where: { type: m.type },
        create: { type: m.type, meaning: m.meaning?.trim() || null, unused: m.unused },
        update: { meaning: m.meaning?.trim() || null, unused: m.unused },
      })
    )
  );
}
