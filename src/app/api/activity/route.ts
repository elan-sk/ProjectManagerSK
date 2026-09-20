import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calendarDay } from "@/lib/delays";

// Latido de actividad real (ver ActivityPing): cada llamada = un minuto en el
// que la persona hizo algo en la app (clic, tecla, scroll). Suma 1 a la
// actividad de su día (calendario Bogotá).
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const day = calendarDay(new Date());
  await prisma.userActivityDay.upsert({
    where: { userId_day: { userId: session.user.id, day } },
    create: { userId: session.user.id, day },
    update: { interactions: { increment: 1 } },
  });
  return NextResponse.json({ ok: true });
}
