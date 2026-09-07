import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const sub = (await request.json()) as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    update: { userId: session.user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    create: {
      userId: session.user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
  });

  return NextResponse.json({ ok: true });
}
