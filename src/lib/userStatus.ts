import { prisma } from "@/lib/prisma";

// Estado real de la cuenta para validar cada sesión (ver callbacks.jwt en auth.ts).
// Caché corta para no consultar la base en cada auth() de una misma página.
// ponytail: caché en memoria del proceso; forgetUserStatus la limpia al instante en este proceso, otro proceso tarda hasta TTL_MS.
const TTL_MS = 30 * 1000;
const cache = new Map<string, { active: boolean; role: string; at: number }>();

export async function getUserStatus(userId: string) {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { active: true, role: true } });
  if (!user) {
    cache.delete(userId);
    return null;
  }
  const entry = { active: user.active, role: user.role, at: Date.now() };
  cache.set(userId, entry);
  return entry;
}

export function forgetUserStatus(userId: string) {
  cache.delete(userId);
}
