import { prisma } from "@/lib/prisma";
import { APP_SETTING_ID } from "@/lib/appSettings";
import { limitWarningToSend, monthStart, usedThisPeriod } from "@/lib/whatsappCloudFormat";
export const LIMIT_REACHED_REASON = "se alcanzó el tope mensual de mensajes de WhatsApp";

export async function getWhatsAppUsage() {
  const s = await prisma.appSetting.findUnique({ where: { id: APP_SETTING_ID } });
  const limit = s?.whatsappMonthlyLimit ?? 1500;
  const used = usedThisPeriod(s?.whatsappPeriodStart ?? null, s?.whatsappSentThisPeriod ?? 0);
  return { used, limit, reached: used >= limit };
}

export async function whatsAppLimitReached() {
  return (await getWhatsAppUsage()).reached;
}

export async function recordWhatsAppSent(count = 1) {
  const warning = await prisma.$transaction(async (tx) => {
    const s = await tx.appSetting.upsert({ where: { id: APP_SETTING_ID }, create: { id: APP_SETTING_ID }, update: {} });
    const now = new Date();
    const fresh = !s.whatsappPeriodStart || s.whatsappPeriodStart < monthStart(now);
    const used = (fresh ? 0 : s.whatsappSentThisPeriod) + count;
    const warnedPct = fresh ? 0 : s.whatsappLimitWarnedPct;
    const pct = limitWarningToSend(used, s.whatsappMonthlyLimit, warnedPct);
    await tx.appSetting.update({
      where: { id: APP_SETTING_ID },
      data: { whatsappSentThisPeriod: used, whatsappPeriodStart: monthStart(now), whatsappLimitWarnedPct: pct ?? warnedPct },
    });
    return pct ? { pct, used, limit: s.whatsappMonthlyLimit } : null;
  });
  if (!warning) return;
  const admins = await prisma.user.findMany({ where: { role: "ADMIN", active: true, deletedAt: null }, select: { id: true } });
  const message =
    warning.pct === 100
      ? `Se alcanzó el tope mensual de mensajes de WhatsApp (${warning.used} de ${warning.limit}). Los avisos automáticos quedan en pausa hasta el próximo mes o hasta subir el tope en Configuración → WhatsApp.`
      : `Ya se usó el 80 % del tope mensual de mensajes de WhatsApp (${warning.used} de ${warning.limit}).`;
  await prisma.notification.createMany({ data: admins.map((a) => ({ userId: a.id, type: "SYSTEM" as const, message })) });
}

export async function setWhatsAppMonthlyLimit(limit: number) {
  const { used } = await getWhatsAppUsage();
  const pct = (used / limit) * 100;
  const warned = pct >= 100 ? 100 : pct >= 80 ? 80 : 0;
  await prisma.appSetting.upsert({
    where: { id: APP_SETTING_ID },
    create: { id: APP_SETTING_ID, whatsappMonthlyLimit: limit },
    update: { whatsappMonthlyLimit: limit, whatsappLimitWarnedPct: warned },
  });
}
