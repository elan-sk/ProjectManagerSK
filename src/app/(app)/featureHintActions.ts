"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { FEATURE_HINTS } from "@/lib/featureHints";

/** Marca una novedad como vista por la persona. Nunca bloquea: si falla, a lo sumo la vuelve a ver. */
export async function markFeatureHintSeen(hintId: string) {
  const session = await auth();
  if (!session?.user || !FEATURE_HINTS.some((h) => h.id === hintId)) return;
  const userId = session.user.id;
  await prisma.userFeatureHint
    .upsert({ where: { userId_hintId: { userId, hintId } }, create: { userId, hintId }, update: {} })
    .catch((err) => console.error("[novedades] no se pudo marcar como vista", err));
}
