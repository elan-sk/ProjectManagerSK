"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function markNotificationRead(id: string) {
  await prisma.notification.update({ where: { id }, data: { read: true } });
  revalidatePath("/", "layout");
}
