import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes, timingSafeEqual } from "node:crypto";

export type ChatChannel = "web" | "whatsapp";

export type ContextActor = { userId: string; role: string; name: string; channel: ChatChannel };

const globalForActor = globalThis as unknown as { actorContext?: AsyncLocalStorage<ContextActor> };
const storage = globalForActor.actorContext ?? new AsyncLocalStorage<ContextActor>();
globalForActor.actorContext = storage;

export function runAsUser<T>(actor: ContextActor, fn: () => Promise<T>): Promise<T> {
  return storage.run(actor, fn);
}

export function contextActor(): ContextActor | undefined {
  return storage.getStore();
}

const globalForSecret = globalThis as unknown as { internalChatSecret?: string };

export function internalChatSecret(): string {
  globalForSecret.internalChatSecret ??= randomBytes(32).toString("hex");
  return globalForSecret.internalChatSecret;
}

export function isInternalChatSecret(value: string | null): boolean {
  if (!value) return false;
  const expected = Buffer.from(internalChatSecret());
  const given = Buffer.from(value);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export const INTERNAL_CHAT_HEADER = "x-internal-chat";
