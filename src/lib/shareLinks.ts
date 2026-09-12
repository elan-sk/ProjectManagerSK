import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { ShareTargetType } from "@prisma/client";

// 24 bytes -> 32 caracteres base64url: suficiente entropía para que el
// token en sí sea la autenticación (nadie sin el link exacto puede entrar).
export function generateShareToken() {
  return randomBytes(24).toString("base64url");
}

/**
 * Crea un link nuevo para el proyecto/tarea, revocando cualquier otro que
 * siguiera activo para ese mismo destino (punto 1.3: nunca dos links
 * activos a la vez para el mismo proyecto/tarea).
 */
export async function createShareLink(targetType: ShareTargetType, targetId: string, createdById: string) {
  const token = generateShareToken();
  const activeFilter = targetType === "PROJECT" ? { projectId: targetId } : { taskId: targetId };
  return prisma.$transaction(async (tx) => {
    await tx.shareLink.updateMany({ where: { ...activeFilter, revokedAt: null }, data: { revokedAt: new Date() } });
    return tx.shareLink.create({
      data: {
        token,
        targetType,
        projectId: targetType === "PROJECT" ? targetId : undefined,
        taskId: targetType === "TASK" ? targetId : undefined,
        createdById,
      },
    });
  });
}

export async function revokeShareLink(id: string) {
  await prisma.shareLink.update({ where: { id }, data: { revokedAt: new Date() } });
}

export async function getActiveShareLink(targetType: ShareTargetType, targetId: string) {
  const where = targetType === "PROJECT" ? { projectId: targetId, revokedAt: null } : { taskId: targetId, revokedAt: null };
  return prisma.shareLink.findFirst({ where, orderBy: { createdAt: "desc" } });
}

export async function resolveShareToken(token: string) {
  const link = await prisma.shareLink.findUnique({ where: { token } });
  if (!link || link.revokedAt) return null;
  return link;
}
