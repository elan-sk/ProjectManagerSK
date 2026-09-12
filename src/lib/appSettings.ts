import { prisma } from "@/lib/prisma";

// Única fila de configuración global de la app (ver AppSetting en schema.prisma).
export const APP_SETTING_ID = "app";

export async function getAppCountryCode() {
  const setting = await prisma.appSetting.findUnique({ where: { id: APP_SETTING_ID } });
  return setting?.countryCode ?? "CO";
}

export async function setAppCountryCode(countryCode: string) {
  await prisma.$transaction([
    prisma.appSetting.upsert({
      where: { id: APP_SETTING_ID },
      create: { id: APP_SETTING_ID, countryCode },
      update: { countryCode },
    }),
    // Todos los proyectos comparten el mismo país (ver AppSetting) — se
    // actualizan de una para que festivos/días hábiles queden consistentes
    // en toda la app apenas se cambia acá.
    prisma.project.updateMany({ data: { countryCode } }),
  ]);
}

export async function getWhatsAppSettings() {
  const setting = await prisma.appSetting.findUnique({ where: { id: APP_SETTING_ID } });
  return {
    groupJid: setting?.whatsappGroupJid ?? null,
    workHoursStart: setting?.workHoursStart ?? 8,
    workHoursEnd: setting?.workHoursEnd ?? 18,
  };
}

export async function setAppWhatsAppGroup(groupJid: string | null) {
  await prisma.appSetting.upsert({
    where: { id: APP_SETTING_ID },
    create: { id: APP_SETTING_ID, whatsappGroupJid: groupJid },
    update: { whatsappGroupJid: groupJid },
  });
}

export async function setAppWorkHours(startHour: number, endHour: number) {
  await prisma.appSetting.upsert({
    where: { id: APP_SETTING_ID },
    create: { id: APP_SETTING_ID, workHoursStart: startHour, workHoursEnd: endHour },
    update: { workHoursStart: startHour, workHoursEnd: endHour },
  });
}
