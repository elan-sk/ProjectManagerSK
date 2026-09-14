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
    dailyDigestHour: setting?.dailyDigestHour ?? setting?.workHoursStart ?? 8,
    dailyDigestMinute: setting?.dailyDigestMinute ?? 0,
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
  const setting = await prisma.appSetting.findUnique({ where: { id: APP_SETTING_ID } });
  const dailyDigestHour = setting?.dailyDigestHour ?? setting?.workHoursStart ?? startHour;
  const dailyDigestMinute = setting?.dailyDigestMinute ?? 0;
  if (dailyDigestHour < startHour || dailyDigestHour >= endHour) {
    throw new Error(`La hora del resumen diario (${String(dailyDigestHour).padStart(2, "0")}:00) debe estar dentro del horario laboral.`);
  }

  await prisma.appSetting.upsert({
    where: { id: APP_SETTING_ID },
    create: { id: APP_SETTING_ID, workHoursStart: startHour, workHoursEnd: endHour, dailyDigestHour, dailyDigestMinute },
    update: { workHoursStart: startHour, workHoursEnd: endHour },
  });
}

export async function setAppDailyDigestTime(hour: number, minute: number) {
  const setting = await prisma.appSetting.findUnique({ where: { id: APP_SETTING_ID } });
  const workHoursStart = setting?.workHoursStart ?? 8;
  const workHoursEnd = setting?.workHoursEnd ?? 18;
  if (hour < workHoursStart || hour >= workHoursEnd || minute < 0 || minute > 59) {
    throw new Error(`Elegí una hora entre ${String(workHoursStart).padStart(2, "0")}:00 y ${String(workHoursEnd - 1).padStart(2, "0")}:59, dentro del horario laboral.`);
  }

  await prisma.appSetting.upsert({
    where: { id: APP_SETTING_ID },
    create: { id: APP_SETTING_ID, workHoursStart, workHoursEnd, dailyDigestHour: hour, dailyDigestMinute: minute },
    update: { dailyDigestHour: hour, dailyDigestMinute: minute },
  });
}
